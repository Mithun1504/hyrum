package sampling

import (
	"testing"
	"time"

	"github.com/hyrum-dev/hyrum/internal/capture"
)

func TestSelectKeepsWholeSessionsAndBoostsLowVolume(t *testing.T) {
	now := time.Date(2026, 7, 18, 10, 0, 0, 0, time.UTC)
	events := []capture.Event{
		{OrganizationID: "org", ConsumerValue: "small", SessionID: "s1", OccurredAt: now},
		{OrganizationID: "org", ConsumerValue: "small", SessionID: "s1", OccurredAt: now.Add(time.Second)},
		{OrganizationID: "org", ConsumerValue: "large", SessionID: "a", OccurredAt: now},
		{OrganizationID: "org", ConsumerValue: "large", SessionID: "b", OccurredAt: now},
		{OrganizationID: "org", ConsumerValue: "large", SessionID: "c", OccurredAt: now},
	}
	config := Config{Rate: 0, Window: time.Hour, LowVolumeThreshold: 1, LowVolumeBoost: 4, Key: []byte("01234567890123456789012345678901")}
	selected, err := Select(events, config)
	if err != nil {
		t.Fatal(err)
	}
	if len(selected) != 2 || selected[0].SessionID != "s1" || selected[1].SessionID != "s1" {
		t.Fatalf("expected the complete low-volume session, got %#v", selected)
	}
}

func TestSelectIsDeterministic(t *testing.T) {
	now := time.Date(2026, 7, 18, 10, 0, 0, 0, time.UTC)
	events := []capture.Event{{OrganizationID: "org", ConsumerValue: "c", SessionID: "a", OccurredAt: now}, {OrganizationID: "org", ConsumerValue: "c", SessionID: "b", OccurredAt: now}}
	config := Config{Rate: 0.5, Window: time.Hour, LowVolumeThreshold: 0, LowVolumeBoost: 1, Key: []byte("01234567890123456789012345678901")}
	first, _ := Select(events, config)
	second, _ := Select(events, config)
	if len(first) != len(second) {
		t.Fatal("selection changed")
	}
	for index := range first {
		if first[index].SessionID != second[index].SessionID {
			t.Fatal("selection changed")
		}
	}
}
