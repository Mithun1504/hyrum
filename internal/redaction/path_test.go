package redaction

import (
	"strings"
	"testing"
)

func TestPathProducesStableRedactedRoute(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	raw := "/customers/person%2540example.com/550e8400-e29b-41d4-a716-446655440000/" +
		"abcdefabcdefabcdefabcdefabcdefab/cust_12345/eyJhbGciOiJIUzI1NiJ9.payload.signature/AbCdEf0123456789AbCdEf0123456789"
	got, err := Path(raw, key)
	if err != nil {
		t.Fatal(err)
	}
	again, err := Path(raw, key)
	if err != nil || again != got {
		t.Fatal("path tokens must be deterministic")
	}
	for _, segment := range strings.Split(strings.TrimPrefix(got, "/"), "/") {
		if domain, ok := TokenDomain(segment); !ok || domain != "string" {
			t.Fatalf("path segment is not a string token: %q", segment)
		}
	}
	for _, secret := range []string{"customers", "person", "550e8400", "abcdef", "cust_12345", "eyJ", "AbCd"} {
		if strings.Contains(got, secret) {
			t.Fatalf("path leaked %q: %s", secret, got)
		}
	}
}

func TestPathRejectsMalformedAndEmbeddedQuery(t *testing.T) {
	for _, raw := range []string{"relative/path", "/customers/%zz", "/customers/cust_1?token=secret", "/customers/cust_1#fragment"} {
		if err := ValidatePath(raw); err == nil {
			t.Fatalf("malformed path %q was accepted", raw)
		}
	}
}

func FuzzPath(f *testing.F) {
	f.Add("/customers/person%40example.com")
	f.Fuzz(func(t *testing.T, raw string) {
		path, err := Path(raw, []byte("0123456789abcdef0123456789abcdef"))
		if err == nil && (!strings.HasPrefix(path, "/") || strings.ContainsAny(path, "?#")) {
			t.Fatalf("unsafe path output: %q", path)
		}
	})
}
