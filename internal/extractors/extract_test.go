package extractors

import (
	"encoding/json"
	"reflect"
	"testing"
)

const token = "hmac-sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

func TestExtractIsDeterministicAndFindsCoreBehaviors(t *testing.T) {
	exchanges := []Exchange{
		{
			Sequence:       1,
			OperationKey:   "list-orders",
			ResponseStatus: 200,
			ResponseBody: map[string]any{
				"orders": []any{
					map[string]any{"id": float64(1), "state": "open"},
					map[string]any{"id": float64(2), "state": "closed"},
				},
				"next_cursor": token,
			},
		},
		{
			Sequence:       2,
			OperationKey:   "list-orders",
			RequestQuery:   map[string]any{"cursor": token},
			ResponseStatus: 422,
			ResponseBody: map[string]any{
				"error": "Order 1842 was rejected at 2026-07-15T12:30:22Z",
				"trace": "550e8400-e29b-41d4-a716-446655440000",
			},
		},
	}

	first, err := Extract(exchanges)
	if err != nil {
		t.Fatal(err)
	}
	if first.SchemaVersion != FingerprintSchemaVersion || first.ExtractorVersion != Version {
		t.Fatalf("unexpected extractor provenance: %#v", first)
	}
	second, err := Extract(exchanges)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatal("extractor output must be deterministic")
	}
	if len(first.Echoes) != 1 {
		t.Fatalf("expected one echo, got %d", len(first.Echoes))
	}
	if first.Echoes[0].SourcePath != "$response/next_cursor" {
		t.Fatalf("unexpected echo source: %s", first.Echoes[0].SourcePath)
	}
	if first.Echoes[0].SourceOperationKey != "list-orders" || len(first.Echoes[0].SourceShapeDigest) != 64 {
		t.Fatal("echo evidence must identify its deterministic source behavior")
	}

	kinds := map[Kind]bool{}
	for _, fingerprint := range first.Fingerprints {
		if fingerprint.OperationKey == "" || fingerprint.ObservationCount < 1 {
			t.Fatalf("fingerprint is missing operation/count provenance: %#v", fingerprint)
		}
		kinds[fingerprint.Kind] = true
		if len(fingerprint.Digest) != 64 {
			t.Fatalf("invalid digest: %q", fingerprint.Digest)
		}
	}
	for _, kind := range []Kind{KindShape, KindOrdering, KindErrorTemplate} {
		if !kinds[kind] {
			t.Fatalf("missing %s fingerprint", kind)
		}
	}

	encoded, err := json.Marshal(first)
	if err != nil || len(encoded) == 0 {
		t.Fatalf("result must serialize: %v", err)
	}
}

func TestShapeDistinguishesNullFromAbsentAndEscapesPointers(t *testing.T) {
	nullShape, err := ShapeFingerprint(map[string]any{"value": nil, "a/b": true})
	if err != nil {
		t.Fatal(err)
	}
	absentShape, err := ShapeFingerprint(map[string]any{"a/b": true})
	if err != nil {
		t.Fatal(err)
	}
	if nullShape.Digest == absentShape.Digest {
		t.Fatal("null and absent must have distinct fingerprints")
	}
	foundEscaped := false
	for _, rawNode := range nullShape.Canonical["nodes"].([]any) {
		node := rawNode.(map[string]any)
		if node["path"] == "$/a~1b" {
			foundEscaped = true
		}
	}
	if !foundEscaped {
		t.Fatal("JSON Pointer path was not escaped")
	}
}

func TestErrorTemplateRemovesInstanceValues(t *testing.T) {
	first, err := ErrorTemplateFingerprint(422, map[string]any{
		"message": "Order 123 failed",
		"trace":   "550e8400-e29b-41d4-a716-446655440000",
	})
	if err != nil {
		t.Fatal(err)
	}
	second, err := ErrorTemplateFingerprint(422, map[string]any{
		"message": "Order 999 failed",
		"trace":   "019f6311-b6c9-7803-9a83-15388a16834d",
	})
	if err != nil {
		t.Fatal(err)
	}
	if first.Digest != second.Digest {
		t.Fatal("equivalent error templates should share a digest")
	}
}

func TestEchoIgnoresUnhashedValues(t *testing.T) {
	exchanges := []Exchange{
		{Sequence: 1, ResponseBody: map[string]any{"cursor": "public-value"}},
		{Sequence: 2, RequestQuery: map[string]any{"cursor": "public-value"}},
	}
	if echoes := Echoes(exchanges); len(echoes) != 0 {
		t.Fatalf("unhashed values must not produce T1 evidence: %#v", echoes)
	}
}
