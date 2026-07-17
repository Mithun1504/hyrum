package capture

import (
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/hyrum-dev/hyrum/internal/extractors"
	"github.com/hyrum-dev/hyrum/internal/redaction"
)

type RawExchange struct {
	Timestamp          time.Time   `json:"timestamp"`
	Sequence           uint64      `json:"sequence"`
	OperationKey       string      `json:"operation_key"`
	ConsumerIdentity   string      `json:"consumer_identity"`
	CorrelationID      string      `json:"correlation_id,omitempty"`
	RecentRequestCount uint64      `json:"recent_request_count"`
	Request            RawRequest  `json:"request"`
	Response           RawResponse `json:"response"`
}

type RawRequest struct {
	Method  string              `json:"method"`
	Path    string              `json:"path"`
	Headers map[string][]string `json:"headers,omitempty"`
	Query   map[string]any      `json:"query,omitempty"`
	Body    any                 `json:"body,omitempty"`
}

type RawResponse struct {
	Status  int                 `json:"status"`
	Headers map[string][]string `json:"headers,omitempty"`
	Body    any                 `json:"body,omitempty"`
}

type ProcessedSession struct {
	SchemaVersion       int                   `json:"schema_version"`
	ExtractorVersion    string                `json:"extractor_version"`
	ConsumerHMAC        string                `json:"consumer_hmac"`
	SessionHMAC         string                `json:"session_hmac"`
	StartedAt           time.Time             `json:"started_at"`
	EndedAt             time.Time             `json:"ended_at"`
	FirstSequence       uint64                `json:"first_sequence"`
	LastSequence        uint64                `json:"last_sequence"`
	Completeness        string                `json:"completeness"`
	CorrelationSource   string                `json:"correlation_source"`
	SamplingProbability float64               `json:"sampling_probability"`
	LowVolumeBoosted    bool                  `json:"low_volume_boosted"`
	Exchanges           []extractors.Exchange `json:"exchanges"`
	Extraction          extractors.Result     `json:"extraction"`
}

type Processor struct {
	StructuralKey       []byte
	ConsumerIdentityKey []byte
	SamplingKey         []byte
	Sampling            SamplingPolicy
	Redaction           redaction.Policy
}

type sessionBuilder struct {
	consumerHMAC string
	decision     SamplingDecision
	correlated   bool
	exchanges    []extractors.Exchange
	timestamps   map[uint64]time.Time
}

func contentType(headers map[string][]string) string {
	for key, values := range headers {
		if strings.EqualFold(key, "content-type") && len(values) > 0 {
			return strings.ToLower(values[0])
		}
	}
	return ""
}

func safeBody(key []byte, headers map[string][]string, body any, policy redaction.Policy) (any, error) {
	mediaType := contentType(headers)
	if strings.HasPrefix(mediaType, "multipart/") ||
		strings.HasPrefix(mediaType, "application/octet-stream") ||
		strings.HasPrefix(mediaType, "image/") || strings.HasPrefix(mediaType, "audio/") ||
		strings.HasPrefix(mediaType, "video/") {
		return nil, nil
	}
	return redaction.RedactBody(key, body, policy)
}

func (processor Processor) Process(events []RawExchange) ([]ProcessedSession, error) {
	if len(processor.StructuralKey) < 32 || len(processor.ConsumerIdentityKey) < 32 || len(processor.SamplingKey) < 32 {
		return nil, errors.New("capture keys must contain at least 32 bytes")
	}
	builders := map[string]*sessionBuilder{}
	for _, event := range events {
		if event.Timestamp.IsZero() || event.Sequence == 0 || event.ConsumerIdentity == "" ||
			event.Request.Method == "" || event.Request.Path == "" || event.Response.Status < 100 {
			return nil, errors.New("capture event is missing required fields")
		}
		consumerHMAC, err := redaction.HashIdentity(processor.ConsumerIdentityKey, event.ConsumerIdentity)
		if err != nil {
			return nil, err
		}
		correlationToken := ""
		if event.CorrelationID != "" {
			correlationToken, err = redaction.StructuralHash(
				processor.StructuralKey,
				[]byte(event.CorrelationID),
			)
			if err != nil {
				return nil, err
			}
		}
		decision, err := DecideSession(
			processor.SamplingKey,
			consumerHMAC,
			correlationToken,
			event.Timestamp,
			event.RecentRequestCount,
			processor.Sampling,
		)
		if err != nil {
			return nil, err
		}
		if !decision.Sampled {
			continue
		}
		requestQuery, err := redaction.RedactBody(processor.StructuralKey, event.Request.Query, processor.Redaction)
		if err != nil {
			return nil, err
		}
		redactedQuery := map[string]any{}
		if requestQuery != nil {
			var valid bool
			redactedQuery, valid = requestQuery.(map[string]any)
			if !valid {
				return nil, errors.New("request query must be a JSON object")
			}
		}
		requestBody, err := safeBody(processor.StructuralKey, event.Request.Headers, event.Request.Body, processor.Redaction)
		if err != nil {
			return nil, err
		}
		responseBody, err := safeBody(processor.StructuralKey, event.Response.Headers, event.Response.Body, processor.Redaction)
		if err != nil {
			return nil, err
		}
		builder := builders[decision.SessionKey]
		if builder == nil {
			builder = &sessionBuilder{
				consumerHMAC: consumerHMAC,
				decision:     decision,
				correlated:   correlationToken != "",
				timestamps:   map[uint64]time.Time{},
			}
			builders[decision.SessionKey] = builder
		}
		builder.timestamps[event.Sequence] = event.Timestamp.UTC()
		builder.exchanges = append(builder.exchanges, extractors.Exchange{
			Sequence:        event.Sequence,
			OperationKey:    event.OperationKey,
			RequestMethod:   strings.ToUpper(event.Request.Method),
			RequestPath:     event.Request.Path,
			RequestHeaders:  redaction.SanitizeHeaders(event.Request.Headers, processor.Redaction),
			RequestQuery:    redactedQuery,
			RequestBody:     requestBody,
			ResponseStatus:  event.Response.Status,
			ResponseHeaders: redaction.SanitizeHeaders(event.Response.Headers, processor.Redaction),
			ResponseBody:    responseBody,
		})
	}

	keys := make([]string, 0, len(builders))
	for key := range builders {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result := make([]ProcessedSession, 0, len(keys))
	for _, key := range keys {
		builder := builders[key]
		sort.Slice(builder.exchanges, func(i, j int) bool {
			return builder.exchanges[i].Sequence < builder.exchanges[j].Sequence
		})
		first := builder.exchanges[0].Sequence
		last := builder.exchanges[len(builder.exchanges)-1].Sequence
		completeness := "complete"
		if last-first+1 != uint64(len(builder.exchanges)) {
			completeness = "partial"
		}
		extraction, err := extractors.Extract(builder.exchanges)
		if err != nil {
			return nil, err
		}
		if completeness != "complete" {
			extraction.Echoes = nil
		}
		correlationSource := "time_window"
		if builder.correlated {
			correlationSource = "configured_correlation_id"
		}
		result = append(result, ProcessedSession{
			SchemaVersion:       1,
			ExtractorVersion:    extractors.Version,
			ConsumerHMAC:        builder.consumerHMAC,
			SessionHMAC:         key,
			StartedAt:           builder.timestamps[first],
			EndedAt:             builder.timestamps[last],
			FirstSequence:       first,
			LastSequence:        last,
			Completeness:        completeness,
			CorrelationSource:   correlationSource,
			SamplingProbability: builder.decision.Probability,
			LowVolumeBoosted:    builder.decision.LowVolumeBoosted,
			Exchanges:           builder.exchanges,
			Extraction:          extraction,
		})
	}
	return result, nil
}
