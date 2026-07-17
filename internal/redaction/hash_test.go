package redaction

import "testing"

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
	if len(first) != len("hmac-sha256:")+64 {
		t.Fatalf("unexpected token format: %q", first)
	}
}

func TestStructuralHashRejectsShortKey(t *testing.T) {
	if _, err := StructuralHash([]byte("short"), []byte("value")); err == nil {
		t.Fatal("expected short keys to be rejected")
	}
}
