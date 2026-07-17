// Package extractors is the single deterministic behavior implementation used by capture and replay.
package extractors

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/hyrum-dev/hyrum/internal/redaction"
)

const Version = "1.0.0"

type Options struct {
	Paginated bool     `json:"paginated,omitempty"`
	MaskPaths []string `json:"mask_paths,omitempty"`
}

type Fingerprint struct {
	Version  string                `json:"version"`
	Status   int                   `json:"status"`
	Shape    []ShapeField          `json:"shape"`
	Error    *ErrorFingerprint     `json:"error,omitempty"`
	Ordering []OrderingFingerprint `json:"ordering,omitempty"`
	Masking  []string              `json:"masking,omitempty"`
}

type ShapeField struct {
	Path string `json:"path"`
	Type string `json:"type"`
}

type ErrorFingerprint struct {
	Status   int    `json:"status"`
	Template string `json:"template"`
	Digest   string `json:"digest"`
}

type OrderingFingerprint struct {
	Path   string   `json:"path"`
	Values []string `json:"values"`
}

func Extract(status int, body any, options Options) Fingerprint {
	masked, applied := ApplyMasks(body, options.MaskPaths)
	fingerprint := Fingerprint{Version: Version, Status: status, Masking: applied}
	walkShape(masked, "$", &fingerprint.Shape)
	sort.Slice(fingerprint.Shape, func(i, j int) bool {
		if fingerprint.Shape[i].Path == fingerprint.Shape[j].Path {
			return fingerprint.Shape[i].Type < fingerprint.Shape[j].Type
		}
		return fingerprint.Shape[i].Path < fingerprint.Shape[j].Path
	})
	fingerprint.Shape = compactShape(fingerprint.Shape)
	if status >= 400 {
		if message := errorMessage(masked); message != "" {
			template := NormalizeError(message)
			fingerprint.Error = &ErrorFingerprint{Status: status, Template: template, Digest: Digest([]byte(template))}
		}
	}
	if options.Paginated {
		walkOrdering(masked, "$", &fingerprint.Ordering)
		sort.Slice(fingerprint.Ordering, func(i, j int) bool { return fingerprint.Ordering[i].Path < fingerprint.Ordering[j].Path })
	}
	return fingerprint
}

func CanonicalJSON(value any) ([]byte, error) {
	return json.Marshal(value)
}

func Digest(value []byte) string {
	sum := sha256.Sum256(value)
	return hex.EncodeToString(sum[:])
}

func walkShape(value any, path string, fields *[]ShapeField) {
	*fields = append(*fields, ShapeField{Path: path, Type: jsonType(value)})
	switch typed := value.(type) {
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			walkShape(typed[key], path+"."+key, fields)
		}
	case []any:
		for _, item := range typed {
			walkShape(item, path+"[]", fields)
		}
	}
}

func compactShape(fields []ShapeField) []ShapeField {
	if len(fields) < 2 {
		return fields
	}
	out := fields[:1]
	for _, field := range fields[1:] {
		last := out[len(out)-1]
		if field.Path != last.Path || field.Type != last.Type {
			out = append(out, field)
		}
	}
	return out
}

func jsonType(value any) string {
	switch typed := value.(type) {
	case nil:
		return "null"
	case bool:
		return "boolean"
	case string:
		if domain, ok := redaction.TokenDomain(typed); ok {
			return domain
		}
		return "string"
	case json.Number:
		return "number"
	case float64, float32, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return "number"
	case []any:
		return "array"
	case map[string]any:
		return "object"
	default:
		return fmt.Sprintf("unsupported:%T", value)
	}
}

var normalizers = []struct {
	re          *regexp.Regexp
	replacement string
}{
	{regexp.MustCompile(`(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b`), "{uuid}"},
	{regexp.MustCompile(`\b\d{4}-\d{2}-\d{2}[Tt][0-9:.+-]+[Zz]?\b`), "{timestamp}"},
	{regexp.MustCompile(`(?i)\b[0-9a-f]{32,}\b`), "{hash}"},
	{regexp.MustCompile(`\b\d+\b`), "{number}"},
}

var indexedPath = regexp.MustCompile(`\[\d+\]`)

func NormalizeError(message string) string {
	if domain, ok := redaction.TokenDomain(message); ok && domain == "string" {
		return message
	}
	normalized := strings.TrimSpace(strings.Join(strings.Fields(redaction.ScrubText(message)), " "))
	for _, rule := range normalizers {
		normalized = rule.re.ReplaceAllString(normalized, rule.replacement)
	}
	return normalized
}

func errorMessage(body any) string {
	if text, ok := body.(string); ok {
		return text
	}
	object, ok := body.(map[string]any)
	if !ok {
		return ""
	}
	for _, key := range []string{"error", "message", "detail"} {
		if text, ok := object[key].(string); ok {
			return text
		}
	}
	return ""
}

func walkOrdering(value any, path string, orderings *[]OrderingFingerprint) {
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			walkOrdering(child, path+"."+key, orderings)
		}
	case []any:
		if len(typed) > 0 {
			values := make([]string, len(typed))
			for i, item := range typed {
				canonical, _ := CanonicalJSON(item)
				values[i] = Digest(canonical)
			}
			*orderings = append(*orderings, OrderingFingerprint{Path: path, Values: values})
		}
		for _, child := range typed {
			walkOrdering(child, path+"[]", orderings)
		}
	}
}

func ApplyMasks(value any, paths []string) (any, []string) {
	if len(paths) == 0 {
		return value, nil
	}
	maskSet := make(map[string]struct{}, len(paths))
	for _, path := range paths {
		maskSet[path] = struct{}{}
	}
	applied := []string{}
	masked := applyMasks(value, "$", maskSet, &applied)
	sort.Strings(applied)
	applied = compact(applied)
	return masked, applied
}

func applyMasks(value any, path string, paths map[string]struct{}, applied *[]string) any {
	patternPath := indexedPath.ReplaceAllString(path, "[]")
	if _, ok := paths[patternPath]; ok {
		*applied = append(*applied, patternPath)
		return "{masked}"
	}
	switch typed := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, child := range typed {
			out[key] = applyMasks(child, path+"."+key, paths, applied)
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for i, child := range typed {
			indexed := path + "[" + strconv.Itoa(i) + "]"
			out[i] = applyMasks(child, indexed, paths, applied)
		}
		return out
	default:
		return value
	}
}

func compact(values []string) []string {
	if len(values) < 2 {
		return values
	}
	out := values[:1]
	for _, value := range values[1:] {
		if value != out[len(out)-1] {
			out = append(out, value)
		}
	}
	return out
}
