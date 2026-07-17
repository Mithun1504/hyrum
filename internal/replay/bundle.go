package replay

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

const maximumObjectBytes = 16 * 1024 * 1024

func LoadBundle(path string) (Bundle, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Bundle{}, fmt.Errorf("read runner bundle: %w", err)
	}
	var bundle Bundle
	if err := json.Unmarshal(data, &bundle); err != nil {
		return Bundle{}, fmt.Errorf("decode runner bundle: %w", err)
	}
	if bundle.ReplayRunID == "" || bundle.Token == "" || bundle.Nonce == "" ||
		bundle.CorpusURL == "" || bundle.ReportUploadPath == "" ||
		bundle.ReportSigningPrivateKey == "" || bundle.RunnerVersion == "" {
		return Bundle{}, errors.New("runner bundle is incomplete")
	}
	return bundle, nil
}

func DownloadCorpus(ctx context.Context, client *http.Client, bundle Bundle) ([]CorpusItem, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, bundle.CorpusURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create corpus download: %w", err)
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("download corpus: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download corpus: unexpected status %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maximumObjectBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read corpus: %w", err)
	}
	if len(body) > maximumObjectBytes {
		return nil, errors.New("corpus exceeds download limit")
	}
	digest := sha256.Sum256(body)
	if !strings.EqualFold(strings.TrimPrefix(bundle.CorpusDigest, "sha256:"), hex.EncodeToString(digest[:])) {
		return nil, errors.New("corpus digest verification failed")
	}
	return DecodeCorpus(bytes.NewReader(body))
}

func UploadReport(ctx context.Context, client *http.Client, controlPlaneURL string, bundle Bundle, report Report) error {
	reportBytes, err := json.Marshal(report)
	if err != nil {
		return fmt.Errorf("encode replay report: %w", err)
	}
	privateDER, err := base64.StdEncoding.DecodeString(bundle.ReportSigningPrivateKey)
	if err != nil {
		return errors.New("decode report signing key")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(privateDER)
	if err != nil {
		return errors.New("parse report signing key")
	}
	privateKey, ok := parsed.(ed25519.PrivateKey)
	if !ok {
		return errors.New("report signing key must be Ed25519")
	}
	envelope, err := json.Marshal(reportEnvelope{
		ReportBase64:    base64.StdEncoding.EncodeToString(reportBytes),
		SignatureBase64: base64.StdEncoding.EncodeToString(ed25519.Sign(privateKey, reportBytes)),
		Nonce:           bundle.Nonce,
	})
	if err != nil {
		return fmt.Errorf("encode report upload: %w", err)
	}
	if !strings.HasPrefix(bundle.ReportUploadPath, "/v1/runner/replays/") ||
		!strings.HasSuffix(bundle.ReportUploadPath, "/report") {
		return errors.New("report upload path is invalid")
	}
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		strings.TrimRight(controlPlaneURL, "/")+bundle.ReportUploadPath,
		bytes.NewReader(envelope),
	)
	if err != nil {
		return fmt.Errorf("create report upload: %w", err)
	}
	request.Header.Set("authorization", "Bearer "+bundle.Token)
	request.Header.Set("content-type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("upload replay report: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusAccepted {
		return fmt.Errorf("upload replay report: unexpected status %d", response.StatusCode)
	}
	return nil
}
