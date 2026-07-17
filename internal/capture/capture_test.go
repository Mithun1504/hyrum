package capture

import (
	"bytes"
	"strings"
	"testing"

	"github.com/hyrum-dev/hyrum/internal/redaction"
	"github.com/hyrum-dev/hyrum/internal/session"
)

const sample = `{"organization_id":"00000000-0000-4000-8000-000000000001","event_id":"e1","session_id":"s1","consumer_value":"secret-api-key","sequence":1,"session_complete":false,"occurred_at":"2026-07-15T10:00:00Z","request":{"method":"GET","path":"/items"},"response":{"status":200,"body":{"next_cursor":"page-2","password":"do-not-emit"}}}
{"organization_id":"00000000-0000-4000-8000-000000000001","event_id":"e2","session_id":"s1","consumer_value":"secret-api-key","sequence":2,"session_complete":true,"occurred_at":"2026-07-15T10:00:01Z","request":{"method":"GET","path":"/items","query":{"cursor":"page-2"}},"response":{"status":200,"body":{"items":[]}}}`

func TestCaptureRedactsAndInfersEcho(t *testing.T) {
	events, err := DecodeNDJSON(strings.NewReader(sample))
	if err != nil {
		t.Fatal(err)
	}
	config := Config{
		OrganizationID:     "00000000-0000-4000-8000-000000000001",
		MasterKey:          []byte("0123456789abcdef0123456789abcdef"),
		OperationTemplates: []string{"GET /items"},
	}
	records, err := Process(events, config)
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := EncodeNDJSON(&output, records); err != nil {
		t.Fatal(err)
	}
	encoded := output.String()
	if strings.Contains(encoded, "secret-api-key") || strings.Contains(encoded, "do-not-emit") ||
		strings.Contains(encoded, `"event_id":"e1"`) || strings.Contains(encoded, `"session_id":"s1"`) {
		t.Fatalf("capture leaked a secret: %s", encoded)
	}
	if records[0].EventID == events[0].EventID || records[0].SessionID == events[0].SessionID ||
		records[0].EventID == records[0].SessionID {
		t.Fatal("capture identifiers were not independently pseudonymized")
	}
	again, err := Process(events, config)
	if err != nil || again[0].EventID != records[0].EventID || again[0].SessionID != records[0].SessionID {
		t.Fatal("pseudonymous identifiers must be deterministic")
	}
	if !strings.Contains(encoded, `"tier":"T1"`) {
		t.Fatalf("capture missed echo evidence: %s", encoded)
	}
	if records[0].Request.PathTemplate != "/items" || strings.Contains(records[0].Request.Path, "/items") {
		t.Fatalf("safe operation template or tokenized path is wrong: %#v", records[0].Request)
	}
	var echo *session.EchoEvidence
	for _, evidence := range records[0].Evidence {
		if evidence.T1 != nil {
			echo = evidence.T1
		}
	}
	if echo == nil || echo.ResponseEventID != records[0].EventID || echo.RequestEventID != records[1].EventID ||
		echo.ResponseSequence != records[0].Sequence || echo.RequestSequence != records[1].Sequence || echo.RequestPath != records[1].Request.Path {
		t.Fatalf("T1 proof is not attributed to the originating response: %#v", echo)
	}
	for _, evidence := range records[1].Evidence {
		if evidence.T1 != nil {
			t.Fatal("T1 proof remained attached to the follow-up request event")
		}
	}
}

func TestCaptureRedactsSensitivePathSegments(t *testing.T) {
	raw := `{"organization_id":"00000000-0000-4000-8000-000000000001","event_id":"path-event","session_id":"path-session","consumer_value":"consumer-secret","sequence":1,"session_complete":true,"occurred_at":"2026-07-15T10:00:00Z","request":{"method":"GET","path":"/customers/person%40example.com/550e8400-e29b-41d4-a716-446655440000/cust_12345/abcdefabcdefabcdefabcdefabcdefab"},"response":{"status":200,"body":{"ok":true}}}`
	events, err := DecodeNDJSON(strings.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	records, err := Process(events, Config{OrganizationID: "00000000-0000-4000-8000-000000000001", MasterKey: []byte("0123456789abcdef0123456789abcdef")})
	if err != nil {
		t.Fatal(err)
	}
	for _, segment := range strings.Split(strings.TrimPrefix(records[0].Request.Path, "/"), "/") {
		if domain, ok := redaction.TokenDomain(segment); !ok || domain != "string" {
			t.Fatalf("path segment was not tokenized: %q", segment)
		}
	}
	var output bytes.Buffer
	if err := EncodeNDJSON(&output, records); err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"person", "550e8400", "cust_12345", "abcdefabcdef"} {
		if strings.Contains(output.String(), secret) {
			t.Fatalf("capture path leaked %q: %s", secret, output.String())
		}
	}
}

func TestEncodeRejectsUnsupportedVersions(t *testing.T) {
	events, err := DecodeNDJSON(strings.NewReader(sample))
	if err != nil {
		t.Fatal(err)
	}
	records, err := Process(events, Config{OrganizationID: "00000000-0000-4000-8000-000000000001", MasterKey: []byte("0123456789abcdef0123456789abcdef")})
	if err != nil {
		t.Fatal(err)
	}
	records[0].RedactionVersion = ""
	if err := EncodeNDJSON(&bytes.Buffer{}, records); err == nil {
		t.Fatal("missing redaction version was accepted")
	}
}

func TestEncodeRejectsT1BoundToWrongEvent(t *testing.T) {
	events, err := DecodeNDJSON(strings.NewReader(sample))
	if err != nil {
		t.Fatal(err)
	}
	records, err := Process(events, Config{OrganizationID: "00000000-0000-4000-8000-000000000001", MasterKey: []byte("0123456789abcdef0123456789abcdef")})
	if err != nil {
		t.Fatal(err)
	}
	for _, evidence := range records[0].Evidence {
		if evidence.T1 != nil {
			evidence.T1.ResponseEventID = records[1].EventID
		}
	}
	if err := EncodeNDJSON(&bytes.Buffer{}, records); err == nil {
		t.Fatal("T1 proof bound to the wrong response event was accepted")
	}
}

func TestDecodeEnforcesEventLimit(t *testing.T) {
	if _, err := decodeNDJSON(strings.NewReader(sample), 1); err == nil || !strings.Contains(err.Error(), "maximum of 1 events") {
		t.Fatalf("expected event limit error, got %v", err)
	}
}

func TestCaptureScrubsPIIFromErrorBodyAndTemplate(t *testing.T) {
	raw := `{"organization_id":"00000000-0000-4000-8000-000000000001","event_id":"error-event","session_id":"error-session","consumer_value":"consumer-secret","sequence":1,"session_complete":true,"occurred_at":"2026-07-15T10:00:00Z","request":{"method":"GET","path":"/customers","query":{"X-Amz-Signature":"short-secret"},"headers":{"Proxy-Authorization":"Basic short-secret"}},"response":{"status":422,"body":{"person@example.com":"dynamic-value","error":"customer cust_12345 email person@example.com card 4242 4242 4242 4242 token=super-secret-value url https://files.example.test/download?X-Amz-Signature=signed-secret"}}}`
	events, err := DecodeNDJSON(strings.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	records, err := Process(events, Config{OrganizationID: "00000000-0000-4000-8000-000000000001", MasterKey: []byte("0123456789abcdef0123456789abcdef")})
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := EncodeNDJSON(&output, records); err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"cust_12345", "person@example.com", "4242", "super-secret-value", "short-secret", "signed-secret"} {
		if strings.Contains(output.String(), secret) {
			t.Fatalf("capture output leaked %q: %s", secret, output.String())
		}
	}
	if records[0].Fingerprint.Error == nil {
		t.Fatal("error fingerprint was not produced")
	}
	if domain, ok := redaction.TokenDomain(records[0].Fingerprint.Error.Template); !ok || domain != "string" {
		t.Fatalf("error template is not structurally redacted: %#v", records[0].Fingerprint.Error)
	}
}

func TestCaptureStructurallyRedactsCanariesAndDropsUnsafeBodies(t *testing.T) {
	const canary = "arbitrary-canary-value-91f0"
	raw := `{"organization_id":"00000000-0000-4000-8000-000000000001","event_id":"canary-event","session_id":"canary-session","consumer_value":"consumer-secret","sequence":1,"session_complete":true,"occurred_at":"2026-07-15T10:00:00Z","request":{"method":"POST","path":"/uploads/arbitrary-canary-value-91f0","query":{"cursor":"arbitrary-canary-value-91f0"},"headers":{"X-Trace":"arbitrary-canary-value-91f0","Content-Type":"multipart/form-data; boundary=arbitrary-canary-value-91f0"},"body":"arbitrary-canary-value-91f0"},"response":{"status":200,"headers":{"X-Trace":"arbitrary-canary-value-91f0","Content-Type":"application/octet-stream"},"body":"arbitrary-canary-value-91f0"}}`
	events, err := DecodeNDJSON(strings.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	records, err := Process(events, Config{OrganizationID: "00000000-0000-4000-8000-000000000001", MasterKey: []byte("0123456789abcdef0123456789abcdef")})
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := EncodeNDJSON(&output, records); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(output.String(), canary) {
		t.Fatalf("capture leaked arbitrary canary: %s", output.String())
	}
	if records[0].Request.Body != nil || records[0].Response.Body != nil {
		t.Fatalf("multipart or binary bodies were retained: %#v", records[0])
	}
	for _, value := range records[0].Request.Headers {
		if value != redaction.Mask {
			t.Fatalf("header value was retained: %#v", records[0].Request.Headers)
		}
	}
}

func TestDecodeFailsFastOnUnknownField(t *testing.T) {
	bad := strings.Replace(sample, `"event_id":"e1"`, `"event_id":"e1","unknown":true`, 1)
	if _, err := DecodeNDJSON(strings.NewReader(bad)); err == nil {
		t.Fatal("expected unknown field rejection")
	}
}

func TestDecodeRejectsResponseFieldsInRequest(t *testing.T) {
	bad := strings.Replace(sample, `"method":"GET","path":"/items"`, `"method":"GET","path":"/items","status":200`, 1)
	if _, err := DecodeNDJSON(strings.NewReader(bad)); err == nil {
		t.Fatal("expected request/response schema separation")
	}
}

func FuzzDecodeNDJSON(f *testing.F) {
	f.Add(sample)
	f.Fuzz(func(t *testing.T, input string) {
		_, _ = DecodeNDJSON(strings.NewReader(input))
	})
}
