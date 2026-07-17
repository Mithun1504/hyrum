package extractors

import (
	"encoding/json"
	"regexp"
	"sort"
	"strings"
)

var (
	uuidPattern      = regexp.MustCompile(`(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b`)
	timestampPattern = regexp.MustCompile(`\b\d{4}-\d{2}-\d{2}[Tt ][0-9:.+\-Zz]+\b`)
	hexPattern       = regexp.MustCompile(`(?i)\b[0-9a-f]{16,}\b`)
	numberPattern    = regexp.MustCompile(`\b\d+(?:\.\d+)?\b`)
)

func normalizeErrorString(value string) string {
	normalized := strings.TrimSpace(value)
	normalized = uuidPattern.ReplaceAllString(normalized, "{uuid}")
	normalized = timestampPattern.ReplaceAllString(normalized, "{timestamp}")
	normalized = hexPattern.ReplaceAllString(normalized, "{token}")
	normalized = numberPattern.ReplaceAllString(normalized, "{number}")
	return normalized
}

func normalizeTemplate(value any, depth int) any {
	if depth > 64 {
		return "{depth_limit}"
	}
	switch typed := value.(type) {
	case string:
		return normalizeErrorString(typed)
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		result := make(map[string]any, len(typed))
		for _, key := range keys {
			result[key] = normalizeTemplate(typed[key], depth+1)
		}
		return result
	case []any:
		result := make([]any, len(typed))
		for index, item := range typed {
			result[index] = normalizeTemplate(item, depth+1)
		}
		return result
	case json.Number, float32, float64, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return "{number}"
	default:
		return value
	}
}

func ErrorTemplateFingerprint(status int, body any) (Fingerprint, error) {
	canonical := map[string]any{
		"status":   status,
		"template": normalizeTemplate(body, 0),
	}
	return fingerprint(KindErrorTemplate, canonical, "Error response template")
}
