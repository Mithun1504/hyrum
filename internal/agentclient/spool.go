package agentclient

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type Spool struct {
	Directory string
	Key       []byte
	MaxBytes  int64
}

func (spool Spool) aead() (cipher.AEAD, error) {
	if len(spool.Key) != 32 {
		return nil, errors.New("spool encryption key must contain exactly 32 bytes")
	}
	block, err := aes.NewCipher(spool.Key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func (spool Spool) Files() ([]string, error) {
	entries, err := os.ReadDir(spool.Directory)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	files := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".spool") {
			files = append(files, filepath.Join(spool.Directory, entry.Name()))
		}
	}
	sort.Strings(files)
	return files, nil
}

func (spool Spool) size() (int64, error) {
	files, err := spool.Files()
	if err != nil {
		return 0, err
	}
	var total int64
	for _, path := range files {
		info, statErr := os.Stat(path)
		if statErr != nil {
			return 0, statErr
		}
		total += info.Size()
	}
	return total, nil
}

func (spool Spool) Put(batchID string, plaintext []byte) (string, error) {
	if spool.MaxBytes < 1 {
		return "", errors.New("spool byte cap must be positive")
	}
	aead, err := spool.aead()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := append(nonce, aead.Seal(nil, nonce, plaintext, nil)...)
	current, err := spool.size()
	if err != nil {
		return "", err
	}
	if current+int64(len(ciphertext)) > spool.MaxBytes {
		return "", errors.New("encrypted spool byte cap exceeded")
	}
	if err := os.MkdirAll(spool.Directory, 0o700); err != nil {
		return "", err
	}
	digest := sha256.Sum256([]byte(batchID))
	path := filepath.Join(spool.Directory, hex.EncodeToString(digest[:])+".spool")
	temporary, err := os.CreateTemp(spool.Directory, ".pending-*")
	if err != nil {
		return "", err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return "", err
	}
	if _, err := temporary.Write(ciphertext); err != nil {
		temporary.Close()
		return "", err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return "", err
	}
	if err := temporary.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return "", err
	}
	return path, nil
}

func (spool Spool) Read(path string) ([]byte, error) {
	aead, err := spool.aead()
	if err != nil {
		return nil, err
	}
	ciphertext, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if len(ciphertext) < aead.NonceSize() {
		return nil, errors.New("invalid encrypted spool record")
	}
	nonce := ciphertext[:aead.NonceSize()]
	return aead.Open(nil, nonce, ciphertext[aead.NonceSize():], nil)
}

func (spool Spool) Delete(path string) error { return os.Remove(path) }
