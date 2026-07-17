package redaction

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

const (
	Mask     = "[REDACTED]"
	MaxDepth = 32
)

var secretNames = map[string]struct{}{
	"authorization": {}, "cookie": {}, "set-cookie": {}, "password": {}, "passwd": {},
	"secret": {}, "token": {}, "access_token": {}, "refresh_token": {}, "api_key": {},
	"apikey": {}, "client_secret": {}, "credential": {}, "signature": {}, "x-api-key": {},
}

// Config adds exact, case-insensitive JSON paths to the built-in secret rules.
type Config struct {
	SensitivePaths []string
}

// Result is the one canonical redaction traversal output. Tokens contains only
// non-sensitive strings eligible for deterministic T1 echo matching.
type Result struct {
	Value  any
	Tokens map[string][]string
}

// Transform replaces every non-null scalar with a tenant-keyed, type-domain
// HMAC token. Sensitive fields are masked and never become T1 candidates.
func Transform(value any, key []byte, config Config) (Result, error) {
	if len(key) < 32 {
		return Result{}, ErrKeyTooShort
	}
	paths := make(map[string]struct{}, len(config.SensitivePaths))
	for _, path := range config.SensitivePaths {
		paths[strings.ToLower(strings.TrimSpace(path))] = struct{}{}
	}
	tokens := map[string][]string{}
	transformed, err := transform(value, "$", 0, key, paths, tokens)
	if err != nil {
		return Result{}, err
	}
	for token := range tokens {
		sort.Strings(tokens[token])
	}
	return Result{Value: transformed, Tokens: tokens}, nil
}

func transform(value any, path string, depth int, key []byte, sensitivePaths map[string]struct{}, tokens map[string][]string) (any, error) {
	if depth > MaxDepth {
		return nil, fmt.Errorf("redaction value exceeds maximum depth of %d", MaxDepth)
	}
	switch typed := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		keys := make([]string, 0, len(typed))
		for name := range typed {
			keys = append(keys, name)
		}
		sort.Strings(keys)
		for _, name := range keys {
			childPath := path + "." + name
			outputName := ScrubText(name)
			if isSecretName(name) || contains(sensitivePaths, childPath) {
				out[outputName] = Mask
				continue
			}
			child, err := transform(typed[name], childPath, depth+1, key, sensitivePaths, tokens)
			if err != nil {
				return nil, err
			}
			out[outputName] = child
		}
		return out, nil
	case []any:
		out := make([]any, len(typed))
		for index, value := range typed {
			childPath := fmt.Sprintf("%s[%d]", path, index)
			child, err := transform(value, childPath, depth+1, key, sensitivePaths, tokens)
			if err != nil {
				return nil, err
			}
			out[index] = child
		}
		return out, nil
	case nil:
		return nil, nil
	case string:
		token, err := TypedToken(key, "string", []byte(typed))
		if err != nil {
			return nil, err
		}
		if len(typed) >= 6 {
			tokens[token] = append(tokens[token], path)
		}
		return token, nil
	case bool:
		return tokenScalar(key, "boolean", typed)
	case json.Number:
		return tokenScalar(key, "number", typed)
	case float64, float32, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return tokenScalar(key, "number", typed)
	default:
		return nil, fmt.Errorf("redaction value has unsupported type %T", value)
	}
}

func tokenScalar(key []byte, domain string, value any) (string, error) {
	canonical, err := json.Marshal(value)
	if err != nil {
		return "", fmt.Errorf("redaction scalar: %w", err)
	}
	return TypedToken(key, domain, canonical)
}

// Headers preserves only names; values can contain credentials even when the
// name looks harmless, so no header value crosses the capture boundary.
func Headers(headers map[string]string) map[string]string {
	if len(headers) == 0 {
		return nil
	}
	out := make(map[string]string, len(headers))
	for name := range headers {
		out[ScrubText(name)] = Mask
	}
	return out
}

func isSecretName(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	if _, ok := secretNames[lower]; ok {
		return true
	}
	return strings.Contains(lower, "authorization") || strings.Contains(lower, "signature") ||
		strings.Contains(lower, "credential") || strings.Contains(lower, "api-key") ||
		strings.HasSuffix(lower, "_token") || strings.HasSuffix(lower, "-token")
}

func SensitiveName(name string) bool { return isSecretName(name) }

func contains(paths map[string]struct{}, path string) bool {
	_, ok := paths[strings.ToLower(path)]
	return ok
}
