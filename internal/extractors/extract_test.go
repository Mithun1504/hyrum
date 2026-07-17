package extractors

import (
	"encoding/json"
	"os"
	"testing"
)

func TestExtractGolden(t *testing.T) {
	body := map[string]any{
		"items":       []any{map[string]any{"id": "a", "legacy_id": nil}},
		"next_cursor": "cursor-1",
	}
	got := Extract(200, body, Options{Paginated: true, MaskPaths: []string{"$.items[].id"}})
	encoded, err := json.MarshalIndent(got, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	want, err := os.ReadFile("testdata/fingerprint.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded)+"\n" != string(want) {
		t.Fatalf("golden mismatch\nwant:\n%s\ngot:\n%s", want, encoded)
	}
}

func TestErrorNormalizationAndDiff(t *testing.T) {
	first := Extract(422, map[string]any{"message": "order 123 failed at 2026-07-15T10:20:30Z"}, Options{})
	second := Extract(422, map[string]any{"message": "order 456 is invalid"}, Options{})
	if first.Error.Template != "order {number} failed at {timestamp}" {
		t.Fatalf("unexpected template: %q", first.Error.Template)
	}
	deltas := Diff(first, second)
	if len(deltas) != 1 || deltas[0].Kind != "error" {
		t.Fatalf("unexpected deltas: %#v", deltas)
	}
}

func TestShapeIncludesFieldsFromEveryArrayObject(t *testing.T) {
	fingerprint := Extract(200, []any{map[string]any{"first": true}, map[string]any{"second": true}}, Options{})
	paths := map[string]bool{}
	for _, field := range fingerprint.Shape {
		paths[field.Path] = true
	}
	if !paths["$[].first"] || !paths["$[].second"] {
		t.Fatalf("array shape lost a variant: %#v", fingerprint.Shape)
	}
}

func FuzzNormalizeError(f *testing.F) {
	f.Add("order 123 failed")
	f.Fuzz(func(t *testing.T, input string) {
		first := NormalizeError(input)
		if first != NormalizeError(input) {
			t.Fatal("normalization is not deterministic")
		}
	})
}
