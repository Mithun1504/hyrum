package capture

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/hyrum-dev/hyrum/internal/redaction"
)

func testProcessor() Processor {
	return Processor{
		StructuralKey:       []byte("0123456789abcdef0123456789abcdef"),
		ConsumerIdentityKey: []byte("consumer-key-0123456789abcdef0123"),
		SamplingKey:         []byte("abcdef0123456789abcdef0123456789"),
		Sampling: SamplingPolicy{
			SessionWindow:      15 * time.Minute,
			BaseRate:           1,
			LowVolumeThreshold: 10,
			LowVolumeBoost:     2,
		},
		Redaction: redaction.Policy{},
	}
}

func TestProcessorRedactsBeforeExtractingSessionEchoes(t *testing.T) {
	canary := "must-never-cross-boundary"
	events := []RawExchange{
		{
			Timestamp:          time.Unix(1_700_000_000, 0),
			Sequence:           1,
			OperationKey:       "list-orders",
			ConsumerIdentity:   "customer-api-key",
			CorrelationID:      "session-1",
			RecentRequestCount: 2,
			Request: RawRequest{
				Method: "GET",
				Path:   "/orders",
				Headers: map[string][]string{
					"Authorization": {"Bearer " + canary},
					"Content-Type":  {"application/json"},
				},
			},
			Response: RawResponse{
				Status: 200,
				Body: map[string]any{
					"next_cursor": "cursor-secret",
					"email":       canary,
				},
			},
		},
		{
			Timestamp:          time.Unix(1_700_000_001, 0),
			Sequence:           2,
			OperationKey:       "list-orders",
			ConsumerIdentity:   "customer-api-key",
			CorrelationID:      "session-1",
			RecentRequestCount: 2,
			Request: RawRequest{
				Method: "GET",
				Path:   "/orders",
				Query:  map[string]any{"cursor": "cursor-secret"},
			},
			Response: RawResponse{Status: 200, Body: map[string]any{"orders": []any{}}},
		},
	}

	sessions, err := testProcessor().Process(events)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 || len(sessions[0].Extraction.Echoes) != 1 {
		t.Fatalf("expected one complete session with one T1 echo: %#v", sessions)
	}
	if sessions[0].Completeness != "complete" || !sessions[0].LowVolumeBoosted {
		t.Fatalf("unexpected session metadata: %#v", sessions[0])
	}
	expectedConsumer, err := redaction.HashIdentity(
		testProcessor().ConsumerIdentityKey,
		"customer-api-key",
	)
	if err != nil || sessions[0].ConsumerHMAC != expectedConsumer {
		t.Fatal("consumer identity must use the independent consumer HMAC key")
	}
	encoded, err := json.Marshal(sessions)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{canary, "customer-api-key", "session-1", "cursor-secret"} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("sensitive source value %q crossed the capture boundary", forbidden)
		}
	}
}

func TestProcessorSuppressesT1ForIncompleteSequences(t *testing.T) {
	events := []RawExchange{
		{
			Timestamp:        time.Unix(1_700_000_000, 0),
			Sequence:         1,
			ConsumerIdentity: "consumer",
			CorrelationID:    "session",
			Request:          RawRequest{Method: "GET", Path: "/items"},
			Response: RawResponse{
				Status: 200,
				Body:   map[string]any{"next_cursor": "cursor"},
			},
		},
		{
			Timestamp:        time.Unix(1_700_000_002, 0),
			Sequence:         3,
			ConsumerIdentity: "consumer",
			CorrelationID:    "session",
			Request: RawRequest{
				Method: "GET",
				Path:   "/items",
				Query:  map[string]any{"cursor": "cursor"},
			},
			Response: RawResponse{Status: 200, Body: map[string]any{}},
		},
	}
	sessions, err := testProcessor().Process(events)
	if err != nil {
		t.Fatal(err)
	}
	if sessions[0].Completeness != "partial" || len(sessions[0].Extraction.Echoes) != 0 {
		t.Fatal("partial sessions must never produce blocking T1 evidence")
	}
}

func TestProcessorDropsMultipartBodies(t *testing.T) {
	events := []RawExchange{{
		Timestamp:        time.Unix(1_700_000_000, 0),
		Sequence:         1,
		ConsumerIdentity: "consumer",
		Request: RawRequest{
			Method:  "POST",
			Path:    "/upload",
			Headers: map[string][]string{"Content-Type": {"multipart/form-data; boundary=test"}},
			Body:    map[string]any{"file": "binary-secret"},
		},
		Response: RawResponse{Status: 204},
	}}
	sessions, err := testProcessor().Process(events)
	if err != nil {
		t.Fatal(err)
	}
	if sessions[0].Exchanges[0].RequestBody != nil {
		t.Fatal("multipart bodies must be dropped before buffering")
	}
}
