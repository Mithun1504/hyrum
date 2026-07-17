package replay

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/hyrum-dev/hyrum/internal/extractors"
)

type Options struct {
	ReplayRunID, CorpusDigest, BaseImageDigest, CandidateImageDigest string
	FixtureDigest, MaskDigest, RunnerVersion, Nonce                  string
	BaseURL, CandidateURL                                            string
	Attempts                                                         int
	Timeout                                                          time.Duration
	AllowFixtureWrites, AllowPublicEgress                            bool
}

func validateTarget(value string, allowPublic bool) error {
	parsed, err := url.Parse(value)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" {
		return errors.New("replay target must be an absolute HTTP URL")
	}
	if allowPublic {
		return nil
	}
	addresses, err := net.LookupIP(parsed.Hostname())
	if err != nil {
		return fmt.Errorf("resolve replay target: %w", err)
	}
	for _, address := range addresses {
		if !address.IsLoopback() {
			return errors.New("public replay target denied; use an isolated local target")
		}
	}
	return nil
}

func execute(ctx context.Context, client *http.Client, target string, item CorpusItem, sequence uint64) (extractors.Fingerprint, error) {
	endpoint, err := url.Parse(strings.TrimRight(target, "/") + item.Request.Path)
	if err != nil {
		return extractors.Fingerprint{}, err
	}
	query := endpoint.Query()
	for key, value := range item.Request.Query {
		query.Set(key, fmt.Sprint(value))
	}
	endpoint.RawQuery = query.Encode()
	var body io.Reader
	if item.Request.Body != nil {
		encoded, encodeErr := json.Marshal(item.Request.Body)
		if encodeErr != nil {
			return extractors.Fingerprint{}, encodeErr
		}
		body = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, item.Request.Method, endpoint.String(), body)
	if err != nil {
		return extractors.Fingerprint{}, err
	}
	for name, values := range item.Request.Headers {
		for _, value := range values {
			request.Header.Add(name, value)
		}
	}
	if body != nil && request.Header.Get("content-type") == "" {
		request.Header.Set("content-type", "application/json")
	}
	response, err := client.Do(request)
	if err != nil {
		return extractors.Fingerprint{}, err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 4*1024*1024+1))
	if err != nil || len(data) > 4*1024*1024 {
		return extractors.Fingerprint{}, errors.New("replay response exceeds limit")
	}
	var responseBody any
	if len(data) > 0 && json.Unmarshal(data, &responseBody) != nil {
		responseBody = string(data)
	}
	result, err := extractors.Extract([]extractors.Exchange{{Sequence: sequence, OperationKey: item.OperationKey, RequestMethod: item.Request.Method, RequestPath: item.Request.NormalizedPath, ResponseStatus: response.StatusCode, ResponseBody: responseBody}})
	if err != nil {
		return extractors.Fingerprint{}, err
	}
	kind := item.BehaviorKind
	if kind == "" && item.CoverageClass != "assertion" {
		kind = item.CoverageClass
	}
	for _, fingerprint := range result.Fingerprints {
		if string(fingerprint.Kind) == kind {
			return fingerprint, nil
		}
	}
	return extractors.Fingerprint{Kind: extractors.Kind(kind), Canonical: map[string]any{"absent": true}}, nil
}

func deltaDigest(item CorpusItem, kind string, before, after extractors.Fingerprint) (string, error) {
	encoded, err := json.Marshal(map[string]any{
		"api_operation_id":  item.APIOperationID,
		"consumer_id":       item.ConsumerID,
		"kind":              kind,
		"request_digest":    strings.TrimPrefix(item.RequestDigest, "sha256:"),
		"before_digest":     strings.TrimPrefix(before.Digest, "sha256:"),
		"after_digest":      strings.TrimPrefix(after.Digest, "sha256:"),
		"normalized_before": before.Canonical,
		"normalized_after":  after.Canonical,
	})
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), nil
}

func Run(ctx context.Context, items []CorpusItem, options Options) (Report, error) {
	if options.Attempts < 2 || options.Attempts > 10 {
		return Report{}, errors.New("attempts must be between 2 and 10")
	}
	if options.ReplayRunID == "" || options.CorpusDigest == "" || options.BaseImageDigest == "" ||
		options.CandidateImageDigest == "" || options.FixtureDigest == "" || options.MaskDigest == "" ||
		options.RunnerVersion == "" || options.Nonce == "" {
		return Report{}, errors.New("immutable replay metadata is incomplete")
	}
	if options.Timeout <= 0 || options.Timeout > time.Minute {
		options.Timeout = 10 * time.Second
	}
	if err := validateTarget(options.BaseURL, options.AllowPublicEgress); err != nil {
		return Report{}, err
	}
	if err := validateTarget(options.CandidateURL, options.AllowPublicEgress); err != nil {
		return Report{}, err
	}
	for _, item := range items {
		if item.RequiresFixture && !options.AllowFixtureWrites {
			return Report{}, errors.New("write request requires an explicit fixture")
		}
	}
	client := &http.Client{
		Timeout:       options.Timeout,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
	}
	started := time.Now().UTC()
	type observed struct {
		before, after extractors.Fingerprint
		agreeing      int
	}
	changes := map[string]*observed{}
	for attempt := 0; attempt < options.Attempts; attempt++ {
		for index, item := range items {
			before, err := execute(ctx, client, options.BaseURL, item, uint64(index+1))
			if err != nil {
				return Report{}, err
			}
			after, err := execute(ctx, client, options.CandidateURL, item, uint64(index+1))
			if err != nil {
				return Report{}, err
			}
			if before.Digest == after.Digest {
				continue
			}
			key := item.RequestDigest + ":" + string(before.Kind)
			entry := changes[key]
			if entry == nil {
				entry = &observed{before: before, after: after}
				changes[key] = entry
			}
			if entry.before.Digest == before.Digest && entry.after.Digest == after.Digest {
				entry.agreeing++
			}
		}
	}
	deltas := make([]Delta, 0, len(changes))
	for _, item := range items {
		kind := item.BehaviorKind
		if kind == "" && item.CoverageClass != "assertion" {
			kind = item.CoverageClass
		}
		entry := changes[item.RequestDigest+":"+kind]
		if entry == nil {
			continue
		}
		digest, err := deltaDigest(item, kind, entry.before, entry.after)
		if err != nil {
			return Report{}, err
		}
		beforeDigest, afterDigest := entry.before.Digest, entry.after.Digest
		stability := "flaky"
		if entry.agreeing == options.Attempts {
			stability = "stable"
		}
		deltas = append(deltas, Delta{APIOperationID: item.APIOperationID, BehaviorDefinitionID: item.BehaviorDefinitionID, ConsumerID: item.ConsumerID, AssertionID: item.AssertionID, RequestDigest: item.RequestDigest, Kind: kind, DeltaDigest: digest, BeforeDigest: &beforeDigest, AfterDigest: &afterDigest, NormalizedBefore: entry.before.Canonical, NormalizedAfter: entry.after.Canonical, Stability: stability, AgreeingAttempts: entry.agreeing, TotalAttempts: options.Attempts})
	}
	nonce := sha256.Sum256([]byte(options.Nonce))
	return Report{SchemaVersion: 1, ReplayRunID: options.ReplayRunID, CorpusDigest: options.CorpusDigest, BaseImageDigest: options.BaseImageDigest, CandidateImageDigest: options.CandidateImageDigest, FixtureDigest: options.FixtureDigest, MaskDigest: options.MaskDigest, RunnerVersion: options.RunnerVersion, NonceDigest: hex.EncodeToString(nonce[:]), ExtractorVersion: extractors.Version, Attempts: options.Attempts, StartedAt: started.Format(time.RFC3339Nano), CompletedAt: time.Now().UTC().Format(time.RFC3339Nano), Deltas: deltas}, nil
}
