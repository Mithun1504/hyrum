// Package redaction contains capture-side privacy primitives shared by agent adapters.
package redaction

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
)

var ErrKeyTooShort = errors.New("redaction HMAC key must contain at least 32 bytes")

const Version = "2.0.0"

// DeriveKey separates tenants and purposes even when they share a master key.
func DeriveKey(master []byte, organizationID, purpose string) ([]byte, error) {
	if len(master) < 32 {
		return nil, ErrKeyTooShort
	}
	if organizationID == "" || purpose == "" {
		return nil, errors.New("organization ID and purpose are required")
	}
	mac := hmac.New(sha256.New, master)
	_, _ = mac.Write([]byte("hyrum:v1\x00" + organizationID + "\x00" + purpose))
	return mac.Sum(nil), nil
}

// StructuralHash creates an equality token without preserving the source value.
// Callers must pass a tenant-and-purpose-derived key.
func StructuralHash(key []byte, value []byte) (string, error) {
	if len(key) < 32 {
		return "", ErrKeyTooShort
	}
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write(value)
	return hex.EncodeToString(mac.Sum(nil)), nil
}

// TypedToken preserves only a scalar's primitive domain and tenant-scoped
// equality. Its source value cannot be recovered from the wire representation.
func TypedToken(key []byte, domain string, canonical []byte) (string, error) {
	switch domain {
	case "string", "number", "boolean":
	default:
		return "", errors.New("unsupported structural token domain")
	}
	digest, err := StructuralHash(key, append([]byte(domain+"\x00"), canonical...))
	if err != nil {
		return "", err
	}
	return "hmac-sha256:" + domain + ":" + digest, nil
}

// TokenDomain validates the exact v2 wire token and returns its primitive JSON domain.
func TokenDomain(value string) (string, bool) {
	parts := strings.Split(value, ":")
	if len(parts) != 3 || parts[0] != "hmac-sha256" || len(parts[2]) != sha256.Size*2 {
		return "", false
	}
	switch parts[1] {
	case "string", "number", "boolean":
	default:
		return "", false
	}
	for _, char := range parts[2] {
		if (char < '0' || char > '9') && (char < 'a' || char > 'f') {
			return "", false
		}
	}
	return parts[1], true
}
