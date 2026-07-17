// Package capture contains privacy-safe, session-preserving capture logic.
package capture

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"time"
)

var ErrInvalidSamplingConfiguration = errors.New("invalid sampling configuration")

type SamplingPolicy struct {
	SessionWindow      time.Duration
	BaseRate           float64
	LowVolumeThreshold uint64
	LowVolumeBoost     float64
}

type SamplingDecision struct {
	Sampled          bool      `json:"sampled"`
	Probability      float64   `json:"probability"`
	WindowStartedAt  time.Time `json:"window_started_at"`
	SessionKey       string    `json:"session_key"`
	LowVolumeBoosted bool      `json:"low_volume_boosted"`
}

func (policy SamplingPolicy) validate() error {
	if policy.SessionWindow <= 0 || policy.BaseRate < 0 || policy.BaseRate > 1 || policy.LowVolumeBoost < 1 {
		return ErrInvalidSamplingConfiguration
	}
	return nil
}

func DecideSession(
	key []byte,
	consumerToken string,
	correlationToken string,
	at time.Time,
	recentRequestCount uint64,
	policy SamplingPolicy,
) (SamplingDecision, error) {
	if len(key) < 32 {
		return SamplingDecision{}, errors.New("sampling key must contain at least 32 bytes")
	}
	if err := policy.validate(); err != nil {
		return SamplingDecision{}, err
	}
	windowUnix := at.Unix() - at.Unix()%int64(policy.SessionWindow/time.Second)
	window := time.Unix(windowUnix, 0).UTC()
	identity := correlationToken
	if identity == "" {
		identity = fmt.Sprintf("window:%d", windowUnix)
	}
	sessionMaterial := consumerToken + "\x00" + identity
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(sessionMaterial))
	sessionDigest := mac.Sum(nil)
	score := float64(binary.BigEndian.Uint64(sessionDigest[:8])) / float64(math.MaxUint64)
	probability := policy.BaseRate
	boosted := recentRequestCount < policy.LowVolumeThreshold
	if boosted {
		probability = math.Min(1, probability*policy.LowVolumeBoost)
	}
	probability = math.Round(probability*100000) / 100000
	return SamplingDecision{
		Sampled:          score < probability,
		Probability:      probability,
		WindowStartedAt:  window,
		SessionKey:       fmt.Sprintf("%x", sessionDigest),
		LowVolumeBoosted: boosted,
	}, nil
}
