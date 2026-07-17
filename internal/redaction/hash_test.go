package redaction

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestStructuralHash(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	first, err := StructuralHash(key, []byte("sensitive"))
	if err != nil {
		t.Fatal(err)
	}
	second, err := StructuralHash(key, []byte("sensitive"))
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatal("expected deterministic hash within one tenant key")
	}
	if first == "sensitive" {
		t.Fatal("hash must not preserve the source value")
	}
}

func TestTransformUsesTypedTokensAndLimitsT1Candidates(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	result, err := Transform(map[string]any{
		"bool": true, "number": json.Number("42"), "short": "open", "cursor": "page-2", "empty": nil,
	}, key, Config{})
	if err != nil {
		t.Fatal(err)
	}
	object := result.Value.(map[string]any)
	for name, domain := range map[string]string{"bool": "boolean", "number": "number", "short": "string", "cursor": "string"} {
		if got, ok := TokenDomain(object[name].(string)); !ok || got != domain {
			t.Fatalf("%s was not a valid %s token: %#v", name, domain, object[name])
		}
	}
	if object["empty"] != nil {
		t.Fatal("null must remain null")
	}
	if len(result.Tokens) != 1 {
		t.Fatalf("only the long string should be eligible for T1, got %#v", result.Tokens)
	}
}

func TestStructuralHashRejectsShortKey(t *testing.T) {
	if _, err := StructuralHash([]byte("short"), []byte("value")); err == nil {
		t.Fatal("expected short keys to be rejected")
	}
}

func TestTenantAndPurposeSeparation(t *testing.T) {
	master := []byte("0123456789abcdef0123456789abcdef")
	first, err := DeriveKey(master, "org-a", "consumer")
	if err != nil {
		t.Fatal(err)
	}
	second, err := DeriveKey(master, "org-a", "values")
	if err != nil {
		t.Fatal(err)
	}
	third, err := DeriveKey(master, "org-b", "consumer")
	if err != nil {
		t.Fatal(err)
	}
	if string(first) == string(second) || string(first) == string(third) {
		t.Fatal("derived keys must be separated by tenant and purpose")
	}
}

func TestTransformMasksSecretsWithoutLeakingArbitraryValues(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	input := map[string]any{
		"password":           "nope",
		"cursor":             "next-1",
		"url":                "https://example.test/file?X-Amz-Signature=secret&part=1",
		"email":              "person@example.test",
		"person@example.com": "dynamic-value",
	}
	result, err := Transform(input, key, Config{})
	if err != nil {
		t.Fatal(err)
	}
	redacted := result.Value.(map[string]any)
	if redacted["password"] != Mask {
		t.Fatalf("unexpected redaction: %#v", redacted)
	}
	encoded, err := json.Marshal(redacted)
	if err != nil {
		t.Fatal(err)
	}
	for _, canary := range []string{"nope", "next-1", "secret", "person", "dynamic-value"} {
		if strings.Contains(string(encoded), canary) {
			t.Fatalf("value %q survived structural redaction: %s", canary, encoded)
		}
	}
	if _, leaked := redacted["person@example.com"]; leaked {
		t.Fatalf("dynamic PII key survived redaction: %#v", redacted)
	}
	headers := Headers(map[string]string{"Proxy-Authorization": "Basic short-secret", "X-Amz-Signature": "short-secret"})
	if headers["Proxy-Authorization"] != Mask || headers["X-Amz-Signature"] != Mask {
		t.Fatalf("credential headers survived redaction: %#v", headers)
	}
	for _, paths := range result.Tokens {
		for _, path := range paths {
			if path == "$.password" {
				t.Fatal("secret values must not be tokenized")
			}
		}
	}
}

func TestTransformRejectsUnsupportedAndExcessiveDepth(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	if _, err := Transform(map[string]any{"bad": make(chan int)}, key, Config{}); err == nil {
		t.Fatal("unsupported type was accepted")
	}
	var value any = "leaf"
	for range MaxDepth + 1 {
		value = []any{value}
	}
	if _, err := Transform(value, key, Config{}); err == nil {
		t.Fatal("excessive depth was accepted")
	}
}

func FuzzTransform(f *testing.F) {
	f.Add("token", "secret")
	f.Fuzz(func(t *testing.T, key, value string) {
		result, err := Transform(map[string]any{key: value}, []byte("0123456789abcdef0123456789abcdef"), Config{})
		if err != nil {
			t.Fatal(err)
		}
		redacted := result.Value.(map[string]any)
		if isSecretName(key) && redacted[ScrubText(key)] != Mask {
			t.Fatal("known secret name was not redacted")
		}
	})
}
