package capture

import (
	"testing"
	"time"
)

func TestDecideSessionPreservesWholeCorrelatedSession(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	policy := SamplingPolicy{
		SessionWindow:      15 * time.Minute,
		BaseRate:           0.2,
		LowVolumeThreshold: 10,
		LowVolumeBoost:     3,
	}
	first, err := DecideSession(key, "consumer", "correlation", time.Unix(1_700_000_000, 0), 100, policy)
	if err != nil {
		t.Fatal(err)
	}
	second, err := DecideSession(key, "consumer", "correlation", time.Unix(1_700_003_000, 0), 100, policy)
	if err != nil {
		t.Fatal(err)
	}
	if first.SessionKey != second.SessionKey || first.Sampled != second.Sampled {
		t.Fatal("correlated requests must share one sampling decision across windows")
	}
}

func TestDecideSessionBoostsLowVolumeConsumers(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	policy := SamplingPolicy{
		SessionWindow:      15 * time.Minute,
		BaseRate:           0.2,
		LowVolumeThreshold: 10,
		LowVolumeBoost:     3,
	}
	decision, err := DecideSession(key, "consumer", "", time.Unix(1_700_000_000, 0), 2, policy)
	if err != nil {
		t.Fatal(err)
	}
	if !decision.LowVolumeBoosted || decision.Probability != 0.6 {
		t.Fatalf("unexpected boost: %#v", decision)
	}
}

func TestDecideSessionRejectsUnsafePolicy(t *testing.T) {
	_, err := DecideSession(
		[]byte("0123456789abcdef0123456789abcdef"),
		"consumer",
		"",
		time.Now(),
		0,
		SamplingPolicy{SessionWindow: time.Minute, BaseRate: 2, LowVolumeBoost: 1},
	)
	if err == nil {
		t.Fatal("expected an invalid policy error")
	}
}
