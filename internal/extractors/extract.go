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

const Version = "1.1.0"

type Options struct {
	Paginated     bool     `json:"paginated,omitempty"`
	MaskPaths     []string `json:"mask_paths,omitempty"`
	ExpectedPaths []string `json:"expected_paths,omitempty"`
}

type Fingerprint struct {
	Version  string                `json:"version"`
	Status   int                   `json:"status"`
	Shape    []ShapeField          `json:"shape"`
	Presence []PresencePattern     `json:"presence,omitempty"`
	Enums    []EnumSet             `json:"enums,omitempty"`
	Error    *ErrorFingerprint     `json:"error,omitempty"`
	Ordering []OrderingFingerprint `json:"ordering,omitempty"`
	Masking  []string              `json:"masking,omitempty"`
}

type ShapeField struct {
	Path string `json:"path"`
	Type string `json:"type"`
}

type PresencePattern struct {
	Path   string   `json:"path"`
	States []string `json:"states"`
}

type EnumSet struct {
	Path      string   `json:"path"`
	Values    []string `json:"values"`
	Truncated bool     `json:"truncated,omitempty"`
}

type ErrorFingerprint struct {
	Status   int    `json:"status"`
	Template string `json:"template"`
	Digest   string `json:"digest"`
}

type OrderingFingerprint struct {
	Path            string   `json:"path"`
	Values          []string `json:"values"`
	CrossPageStable *bool    `json:"cross_page_stable,omitempty"`
	PageSamples     int      `json:"page_samples,omitempty"`
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
	fingerprint.Presence = presenceFor(masked, options.ExpectedPaths)
	fingerprint.Enums = enumSets(masked)
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

// FinalizeSeries is retained for callers whose series has one tenant, consumer, session, and
// operation. Capture uses the narrower finalizers so presence spans sessions while ordering stays
// session-scoped.
func FinalizeSeries(fingerprints []*Fingerprint) {
	FinalizePresenceSeries(fingerprints)
	FinalizeOrderingSeries(fingerprints)
}

// FinalizePresenceSeries records observed absent/null/present states and enum sets for one
// tenant, consumer, and operation across all available sessions.
func FinalizePresenceSeries(fingerprints []*Fingerprint) {
	if len(fingerprints) == 0 {
		return
	}
	pathStates := map[string]map[string]struct{}{}
	pathCounts := map[string]int{}
	for _, fingerprint := range fingerprints {
		seen := map[string]string{}
		for _, field := range fingerprint.Shape {
			state := "present"
			if field.Type == "null" {
				state = "null"
			}
			if _, alreadySeen := seen[field.Path]; !alreadySeen {
				pathCounts[field.Path]++
			}
			seen[field.Path] = state
			if pathStates[field.Path] == nil {
				pathStates[field.Path] = map[string]struct{}{}
			}
			pathStates[field.Path][state] = struct{}{}
		}
		for path := range pathStates {
			if _, ok := seen[path]; !ok {
				pathStates[path]["absent"] = struct{}{}
			}
		}
	}
	for path, count := range pathCounts {
		if count < len(fingerprints) {
			pathStates[path]["absent"] = struct{}{}
		}
	}
	patterns := make([]PresencePattern, 0, len(pathStates))
	for path, states := range pathStates {
		values := make([]string, 0, len(states))
		for state := range states {
			values = append(values, state)
		}
		sort.Strings(values)
		patterns = append(patterns, PresencePattern{Path: path, States: values})
	}
	sort.Slice(patterns, func(i, j int) bool { return patterns[i].Path < patterns[j].Path })

	const maxEnumValues = 32
	enumValues := map[string]map[string]struct{}{}
	enumTruncated := map[string]bool{}
	for _, fingerprint := range fingerprints {
		for _, enum := range fingerprint.Enums {
			if enumValues[enum.Path] == nil {
				enumValues[enum.Path] = map[string]struct{}{}
			}
			enumTruncated[enum.Path] = enumTruncated[enum.Path] || enum.Truncated
			for _, value := range enum.Values {
				if len(enumValues[enum.Path]) >= maxEnumValues {
					enumTruncated[enum.Path] = true
					continue
				}
				enumValues[enum.Path][value] = struct{}{}
			}
		}
	}
	aggregatedEnums := make([]EnumSet, 0, len(enumValues))
	for path, values := range enumValues {
		items := make([]string, 0, len(values))
		for value := range values {
			items = append(items, value)
		}
		sort.Strings(items)
		aggregatedEnums = append(aggregatedEnums, EnumSet{Path: path, Values: items, Truncated: enumTruncated[path]})
	}
	sort.Slice(aggregatedEnums, func(i, j int) bool { return aggregatedEnums[i].Path < aggregatedEnums[j].Path })
	for _, fingerprint := range fingerprints {
		fingerprint.Presence = patterns
		fingerprint.Enums = aggregatedEnums
	}
}

// FinalizeOrderingSeries records collision-free pagination ordering for one tenant, consumer,
// session, and operation. Session scoping prevents unrelated requests from being conflated.
func FinalizeOrderingSeries(fingerprints []*Fingerprint) {
	if len(fingerprints) == 0 {
		return
	}
	orderValues := map[string]map[string]struct{}{}
	orderSamples := map[string]int{}
	orderStable := map[string]bool{}
	for _, fingerprint := range fingerprints {
		for _, ordering := range fingerprint.Ordering {
			if orderValues[ordering.Path] == nil {
				orderValues[ordering.Path] = map[string]struct{}{}
				orderStable[ordering.Path] = true
			}
			orderSamples[ordering.Path]++
			for _, value := range ordering.Values {
				if _, duplicate := orderValues[ordering.Path][value]; duplicate {
					orderStable[ordering.Path] = false
				}
				orderValues[ordering.Path][value] = struct{}{}
			}
		}
	}
	for _, fingerprint := range fingerprints {
		for i := range fingerprint.Ordering {
			path := fingerprint.Ordering[i].Path
			stable := orderStable[path]
			fingerprint.Ordering[i].CrossPageStable = &stable
			fingerprint.Ordering[i].PageSamples = orderSamples[path]
		}
	}
}

func presenceFor(value any, expected []string) []PresencePattern {
	states := map[string]string{}
	walkPresence(value, "$", states)
	for _, path := range expected {
		if _, ok := states[path]; !ok {
			states[path] = "absent"
		}
	}
	patterns := make([]PresencePattern, 0, len(states))
	for path, state := range states {
		patterns = append(patterns, PresencePattern{Path: path, States: []string{state}})
	}
	sort.Slice(patterns, func(i, j int) bool { return patterns[i].Path < patterns[j].Path })
	return patterns
}

func walkPresence(value any, path string, states map[string]string) {
	state := "present"
	if value == nil {
		state = "null"
	}
	states[path] = state
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			walkPresence(child, path+"."+key, states)
		}
	case []any:
		for _, child := range typed {
			walkPresence(child, path+"[]", states)
		}
	}
}

func enumSets(value any) []EnumSet {
	const maxEnumValues = 32
	sets := map[string]map[string]struct{}{}
	truncated := map[string]bool{}
	var walk func(any, string)
	walk = func(value any, path string) {
		switch typed := value.(type) {
		case map[string]any:
			for key, child := range typed {
				walk(child, path+"."+key)
			}
		case []any:
			for _, child := range typed {
				walk(child, path+"[]")
			}
		case nil:
			return
		default:
			canonical, err := CanonicalJSON(typed)
			if err != nil {
				return
			}
			if sets[path] == nil {
				sets[path] = map[string]struct{}{}
			}
			if len(sets[path]) >= maxEnumValues {
				truncated[path] = true
				return
			}
			sets[path][Digest(canonical)] = struct{}{}
		}
	}
	walk(value, "$")
	out := make([]EnumSet, 0, len(sets))
	for path, values := range sets {
		items := make([]string, 0, len(values))
		for value := range values {
			items = append(items, value)
		}
		sort.Strings(items)
		out = append(out, EnumSet{Path: path, Values: items, Truncated: truncated[path]})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	return out
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
