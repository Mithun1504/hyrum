// Package redaction contains capture-side privacy primitives shared by agent adapters.
package redaction

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
)

var ErrKeyTooShort = errors.New("redaction HMAC key must contain at least 32 bytes")

// StructuralHash creates a tenant-scoped equality token without preserving the source value.
func StructuralHash(key []byte, value []byte) (string, error) {
	if len(key) < 32 {
		return "", ErrKeyTooShort
	}
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write(value)
	return hex.EncodeToString(mac.Sum(nil)), nil
}
