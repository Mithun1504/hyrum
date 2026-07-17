package redaction

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func toJSON(t *testing.T, value any) string {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(encoded)
}

func TestSanitizeHeadersDropsCredentialsAndUnknownHeaders(t *testing.T) {
	headers := map[string][]string{
		"Authorization":     {"Bearer never-log-me"},
		"Cookie":            {"session=never-log-me"},
		"Content-Type":      {"application/json"},
		"X-Correlation-ID":  {"request-1"},
		"X-Internal-Secret": {"never-log-me"},
	}
	result := SanitizeHeaders(headers, Policy{})
	if len(result) != 2 {
		t.Fatalf("unexpected sanitized headers: %#v", result)
	}
	for _, values := range result {
		if strings.Contains(strings.Join(values, ""), "never-log-me") {
			t.Fatal("forbidden value crossed the redaction boundary")
		}
	}
}

func TestRedactBodyHashesSensitiveValuesWithoutChangingOtherShape(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	body := map[string]any{
		"email": "person@example.test",
		"profile": map[string]any{
			"name":  "Ada",
			"token": "secret-token",
		},
		"items": []any{map[string]any{"password": "secret-password"}},
	}
	first, err := RedactBody(key, body, Policy{})
	if err != nil {
		t.Fatal(err)
	}
	second, err := RedactBody(key, body, Policy{})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatal("redaction must be deterministic")
	}
	encoded := strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(
		strings.ReplaceAll(toJSON(t, first), "\\u003c", "<"), "\\u003e", ">"), "\\u0026", "&"), "\\/", "/")
	for _, forbidden := range []string{"person@example.test", "secret-token", "secret-password"} {
		if strings.Contains(encoded, forbidden) {
			t.Fatalf("sensitive value %q crossed the boundary", forbidden)
		}
	}
	if !strings.Contains(encoded, "Ada") || !strings.Contains(encoded, "hmac-sha256:") {
		t.Fatalf("expected safe shape and hash tokens: %s", encoded)
	}
}

func TestHashIdentityIsTenantScoped(t *testing.T) {
	first, err := HashIdentity([]byte("0123456789abcdef0123456789abcdef"), "client-a")
	if err != nil {
		t.Fatal(err)
	}
	second, err := HashIdentity([]byte("abcdef0123456789abcdef0123456789"), "client-a")
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Fatal("different tenant keys must not create comparable identities")
	}
}
