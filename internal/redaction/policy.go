package redaction

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
)

var ErrBodyNotJSON = errors.New("body is not a supported JSON value")

var forbiddenHeaders = map[string]struct{}{
	"authorization":       {},
	"cookie":              {},
	"proxy-authorization": {},
	"set-cookie":          {},
	"x-api-key":           {},
	"x-auth-token":        {},
}

var safeHeaders = map[string]struct{}{
	"accept":           {},
	"content-type":     {},
	"user-agent":       {},
	"x-request-id":     {},
	"x-correlation-id": {},
}

var defaultSensitiveKeys = map[string]struct{}{
	"access_token":  {},
	"api_key":       {},
	"apikey":        {},
	"authorization": {},
	"cookie":        {},
	"credit_card":   {},
	"email":         {},
	"password":      {},
	"phone":         {},
	"refresh_token": {},
	"secret":        {},
	"ssn":           {},
	"token":         {},
}

var defaultStructuralKeys = map[string]struct{}{
	"cursor":      {},
	"id":          {},
	"legacy_id":   {},
	"next_cursor": {},
}

type Policy struct {
	SensitiveKeys  []string
	StructuralKeys []string
	AllowedHeaders []string
	MaximumDepth   int
}

func normalizedSet(values []string, defaults map[string]struct{}) map[string]struct{} {
	result := make(map[string]struct{}, len(values)+len(defaults))
	for key := range defaults {
		result[key] = struct{}{}
	}
	for _, value := range values {
		result[strings.ToLower(strings.TrimSpace(value))] = struct{}{}
	}
	return result
}

func SanitizeHeaders(headers map[string][]string, policy Policy) map[string][]string {
	allowed := normalizedSet(policy.AllowedHeaders, safeHeaders)
	result := map[string][]string{}
	keys := make([]string, 0, len(headers))
	for key := range headers {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		normalized := strings.ToLower(strings.TrimSpace(key))
		if _, forbidden := forbiddenHeaders[normalized]; forbidden {
			continue
		}
		if _, accepted := allowed[normalized]; !accepted {
			continue
		}
		values := headers[key]
		copied := make([]string, len(values))
		copy(copied, values)
		result[normalized] = copied
	}
	return result
}

func RedactBody(key []byte, body any, policy Policy) (any, error) {
	maximumDepth := policy.MaximumDepth
	if maximumDepth <= 0 || maximumDepth > 64 {
		maximumDepth = 32
	}
	return redactValue(
		key,
		body,
		normalizedSet(policy.SensitiveKeys, defaultSensitiveKeys),
		normalizedSet(policy.StructuralKeys, defaultStructuralKeys),
		maximumDepth,
		0,
	)
}

func redactValue(
	key []byte,
	value any,
	sensitiveKeys map[string]struct{},
	structuralKeys map[string]struct{},
	maximumDepth int,
	depth int,
) (any, error) {
	if depth > maximumDepth {
		return "{depth_limit}", nil
	}
	switch typed := value.(type) {
	case nil, bool, string, float64, json.Number:
		return typed, nil
	case map[string]any:
		result := make(map[string]any, len(typed))
		keys := make([]string, 0, len(typed))
		for childKey := range typed {
			keys = append(keys, childKey)
		}
		sort.Strings(keys)
		for _, childKey := range keys {
			child := typed[childKey]
			normalizedKey := strings.ToLower(childKey)
			_, sensitive := sensitiveKeys[normalizedKey]
			_, structural := structuralKeys[normalizedKey]
			if sensitive || structural {
				canonical, err := json.Marshal(child)
				if err != nil {
					return nil, fmt.Errorf("marshal sensitive value: %w", err)
				}
				token, err := StructuralHash(key, canonical)
				if err != nil {
					return nil, err
				}
				result[childKey] = token
				continue
			}
			redacted, err := redactValue(
				key,
				child,
				sensitiveKeys,
				structuralKeys,
				maximumDepth,
				depth+1,
			)
			if err != nil {
				return nil, err
			}
			result[childKey] = redacted
		}
		return result, nil
	case []any:
		result := make([]any, len(typed))
		for index, child := range typed {
			redacted, err := redactValue(
				key,
				child,
				sensitiveKeys,
				structuralKeys,
				maximumDepth,
				depth+1,
			)
			if err != nil {
				return nil, err
			}
			result[index] = redacted
		}
		return result, nil
	default:
		return nil, fmt.Errorf("%w: %T", ErrBodyNotJSON, value)
	}
}

func HashIdentity(key []byte, identity string) (string, error) {
	normalized := strings.TrimSpace(identity)
	if normalized == "" {
		return "", errors.New("consumer identity is empty")
	}
	return StructuralHash(key, []byte(normalized))
}
