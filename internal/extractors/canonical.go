package extractors

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

func CanonicalJSON(value any) ([]byte, error) {
	return json.Marshal(value)
}

func Digest(value any) (string, error) {
	canonical, err := CanonicalJSON(value)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canonical)
	return hex.EncodeToString(sum[:]), nil
}

func fingerprint(kind Kind, canonical map[string]any, label string) (Fingerprint, error) {
	digest, err := Digest(canonical)
	if err != nil {
		return Fingerprint{}, err
	}
	return Fingerprint{
		Kind:          kind,
		SchemaVersion: FingerprintSchemaVersion,
		Canonical:     canonical,
		Digest:        digest,
		DefaultLabel:  label,
	}, nil
}
