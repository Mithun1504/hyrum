// Package sampling selects complete consumer sessions before redaction and egress.
package sampling

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"sort"
	"time"

	"github.com/hyrum-dev/hyrum/internal/capture"
)

type Config struct {
	Rate               float64
	Window             time.Duration
	LowVolumeThreshold int
	LowVolumeBoost     float64
	Key                []byte
}

type sessionKey struct {
	organization string
	consumer     string
	window       time.Time
	session      string
}

// Select deterministically keeps or drops whole sessions within each consumer×window stratum.
// Low-volume strata receive the configured multiplicative boost and always keep one session.
func Select(events []capture.Event, config Config) ([]capture.Event, error) {
	if config.Rate < 0 || config.Rate > 1 {
		return nil, errors.New("sampling rate must be between 0 and 1")
	}
	if config.Window <= 0 {
		return nil, errors.New("sampling window must be positive")
	}
	if config.LowVolumeThreshold < 0 || config.LowVolumeBoost < 1 {
		return nil, errors.New("low-volume threshold must be non-negative and boost must be at least 1")
	}
	if len(config.Key) < 32 {
		return nil, errors.New("sampling key must be at least 32 bytes")
	}
	if config.Rate == 1 || len(events) == 0 {
		return append([]capture.Event(nil), events...), nil
	}

	sessions := map[sessionKey][]int{}
	strata := map[string][]sessionKey{}
	for index, event := range events {
		window := event.OccurredAt.UTC().Truncate(config.Window)
		key := sessionKey{event.OrganizationID, event.ConsumerValue, window, event.SessionID}
		sessions[key] = append(sessions[key], index)
		stratum := event.OrganizationID + "\x00" + event.ConsumerValue + "\x00" + window.Format(time.RFC3339Nano)
		if len(sessions[key]) == 1 {
			strata[stratum] = append(strata[stratum], key)
		}
	}

	selected := make([]bool, len(events))
	for _, keys := range strata {
		rate := config.Rate
		if len(keys) <= config.LowVolumeThreshold {
			rate *= config.LowVolumeBoost
			if rate > 1 {
				rate = 1
			}
		}
		sort.Slice(keys, func(i, j int) bool { return score(keys[i], config.Key) < score(keys[j], config.Key) })
		kept := 0
		for _, key := range keys {
			if normalizedScore(key, config.Key) < rate {
				mark(selected, sessions[key])
				kept++
			}
		}
		if kept == 0 && len(keys) <= config.LowVolumeThreshold && len(keys) > 0 {
			mark(selected, sessions[keys[0]])
		}
	}
	out := make([]capture.Event, 0, len(events))
	for index, event := range events {
		if selected[index] {
			out = append(out, event)
		}
	}
	return out, nil
}

func mark(selected []bool, indexes []int) {
	for _, index := range indexes {
		selected[index] = true
	}
}

func score(key sessionKey, secret []byte) uint64 {
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(key.organization + "\x00" + key.consumer + "\x00" + key.window.Format(time.RFC3339Nano) + "\x00" + key.session))
	return binary.BigEndian.Uint64(mac.Sum(nil)[:8])
}

func normalizedScore(key sessionKey, secret []byte) float64 {
	return float64(score(key, secret)) / float64(^uint64(0))
}
