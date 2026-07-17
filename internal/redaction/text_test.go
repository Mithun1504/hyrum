package redaction

import (
	"strings"
	"testing"
)

func TestScrubText(t *testing.T) {
	raw := "email person@example.com bearer Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature " +
		"token=super-secret-value key sk-1234567890abcdef card 4242 4242 4242 4242 customer cust_12345 " +
		"uuid 550e8400-e29b-41d4-a716-446655440000 hash abcdefabcdefabcdefabcdefabcdefab " +
		"url https://files.example.test/cust_12345?X-Amz-Signature=secret&email=person@example.com"
	got := ScrubText(raw)
	for _, secret := range []string{"person@example.com", "eyJhbGci", "super-secret-value", "sk-1234567890abcdef", "4242", "cust_12345", "550e8400", "abcdefabcdef", "X-Amz-Signature", "secret&email"} {
		if strings.Contains(got, secret) {
			t.Fatalf("scrubber leaked %q in %q", secret, got)
		}
	}
	for _, marker := range []string{"{email}", "{token}", "{card}", "{customer_id}", "?{query}"} {
		if !strings.Contains(got, marker) {
			t.Fatalf("scrubber lost marker %q in %q", marker, got)
		}
	}
	if second := ScrubText(got); got != second {
		t.Fatalf("scrubbing must be idempotent\nfirst:  %q\nsecond: %q", got, second)
	}
}

func FuzzScrubText(f *testing.F) {
	f.Add("person@example.com token=secret-value https://example.test/file?sig=secret")
	f.Fuzz(func(t *testing.T, input string) {
		first := ScrubText(input)
		if first != ScrubText(first) {
			t.Fatal("scrubbing is not deterministic and idempotent")
		}
	})
}
