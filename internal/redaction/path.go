package redaction

import (
	"errors"
	"net/url"
	"strings"
)

// ValidatePath accepts only absolute paths without embedded query or fragment data.
func ValidatePath(raw string) error {
	_, err := PathSegments(raw)
	return err
}

// Path tokenizes every non-empty segment so arbitrary identifiers and route
// literals cannot cross the capture boundary as plaintext.
func Path(raw string, key []byte) (string, error) {
	segments, err := PathSegments(raw)
	if err != nil {
		return "", err
	}
	for index := 1; index < len(segments); index++ {
		if segments[index] == "" {
			continue
		}
		segments[index], err = TypedToken(key, "string", []byte(segments[index]))
		if err != nil {
			return "", err
		}
	}
	return strings.Join(segments, "/"), nil
}

// PathSegments decodes an absolute request path without allowing query or fragment data.
// Callers must not emit its returned values outside the customer boundary.
func PathSegments(raw string) ([]string, error) {
	if !strings.HasPrefix(raw, "/") || strings.ContainsAny(raw, "?#") {
		return nil, errors.New("request path must be absolute and exclude query strings and fragments")
	}
	segments := strings.Split(raw, "/")
	if len(segments)-1 > MaxDepth {
		return nil, errors.New("request path exceeds maximum segment depth")
	}
	for index := 1; index < len(segments); index++ {
		decoded, err := decodePathSegment(segments[index])
		if err != nil {
			return nil, errors.New("request path contains invalid percent-encoding")
		}
		segments[index] = decoded
	}
	return segments, nil
}

func decodePathSegment(segment string) (string, error) {
	decoded := segment
	for range 3 {
		next, err := url.PathUnescape(decoded)
		if err != nil {
			return "", err
		}
		if next == decoded {
			return decoded, nil
		}
		decoded = next
	}
	return decoded, nil
}
