// Package replay runs the same corpus against base and candidate HTTP targets.
package replay

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/netip"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/hyrum-dev/hyrum/internal/extractors"
	"github.com/hyrum-dev/hyrum/internal/identity"
	"github.com/hyrum-dev/hyrum/internal/redaction"
	"github.com/hyrum-dev/hyrum/internal/report"
)

const Version = "1.0.0"

type Config struct {
	Version              string                `json:"version"`
	OrganizationID       string                `json:"organization_id"`
	BaseURL              string                `json:"base_url"`
	CandidateURL         string                `json:"candidate_url"`
	BaseImageDigest      string                `json:"base_image_digest"`
	CandidateImageDigest string                `json:"candidate_image_digest"`
	FixtureDigest        string                `json:"fixture_digest"`
	PolicyID             string                `json:"policy_id"`
	PolicyVersion        int                   `json:"policy_version"`
	Runs                 int                   `json:"runs"`
	TimeoutMS            int                   `json:"timeout_ms"`
	SigningKeyID         string                `json:"signing_key_id"`
	AllowedHosts         []string              `json:"allowed_hosts"`
	MaskPaths            []string              `json:"mask_paths,omitempty"`
	Source               *report.SourceContext `json:"source,omitempty"`
	Corpus               []CorpusItem          `json:"corpus"`
}

type CorpusItem struct {
	CaseID         string      `json:"case_id"`
	OrganizationID string      `json:"organization_id"`
	SessionID      string      `json:"session_id"`
	ConsumerID     string      `json:"consumer_id"`
	Sequence       int64       `json:"sequence"`
	Request        Request     `json:"request"`
	Claims         []Claim     `json:"claims,omitempty"`
	Assertions     []Assertion `json:"assertions,omitempty"`
}

type Request struct {
	Method  string            `json:"method"`
	Path    string            `json:"path"`
	Query   map[string]any    `json:"query,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    any               `json:"body,omitempty"`
}

type Claim struct {
	ClaimID      string `json:"claim_id"`
	BehaviorKind string `json:"behavior_kind"`
	BehaviorPath string `json:"behavior_path"`
}

type Assertion struct {
	AssertionID  string  `json:"assertion_id"`
	BehaviorID   string  `json:"behavior_id"`
	ClaimID      *string `json:"claim_id"`
	BehaviorKind string  `json:"behavior_kind"`
	BehaviorPath string  `json:"behavior_path"`
}

type Runner struct {
	Client      *http.Client
	Now         func() time.Time
	Resolver    IPResolver
	DialContext dialContextFunc
}

func DecodeConfig(input io.Reader) (Config, error) {
	var config Config
	decoder := json.NewDecoder(input)
	decoder.DisallowUnknownFields()
	decoder.UseNumber()
	if err := decoder.Decode(&config); err != nil {
		return Config{}, err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return Config{}, errors.New("replay config contains multiple JSON values")
		}
		return Config{}, err
	}
	if err := config.Validate(); err != nil {
		return Config{}, err
	}
	return config, nil
}

func (config *Config) Validate() error {
	if config.Version == "" {
		config.Version = Version
	}
	if config.Version != Version || config.OrganizationID == "" || config.SigningKeyID == "" {
		return errors.New("supported version, organization_id, and signing_key_id are required")
	}
	if !report.ValidImageDigest(config.BaseImageDigest) || !report.ValidImageDigest(config.CandidateImageDigest) {
		return errors.New("base_image_digest and candidate_image_digest must be immutable sha256:<64 lowercase hex> digests")
	}
	if config.BaseImageDigest == config.CandidateImageDigest {
		return errors.New("base_image_digest and candidate_image_digest must differ")
	}
	if !report.ValidDigest(config.FixtureDigest) {
		return errors.New("fixture_digest must be sha256:<64 lowercase hex>")
	}
	if !identity.ValidUUID(config.PolicyID) || config.PolicyVersion < 1 {
		return errors.New("policy_id must be a UUID and policy_version must be positive")
	}
	if !identity.ValidUUID(config.OrganizationID) {
		return errors.New("organization_id must be a UUID")
	}
	if err := report.ValidateSourceContext(config.Source); err != nil {
		return fmt.Errorf("source: %w", err)
	}
	base, err := validateTarget(config.BaseURL)
	if err != nil {
		return fmt.Errorf("base_url: %w", err)
	}
	candidate, err := validateTarget(config.CandidateURL)
	if err != nil {
		return fmt.Errorf("candidate_url: %w", err)
	}
	if base.String() == candidate.String() {
		return errors.New("base_url and candidate_url must differ")
	}
	if len(config.AllowedHosts) == 0 {
		return errors.New("allowed_hosts must explicitly approve replay targets")
	}
	allowed := normalizedHosts(config.AllowedHosts)
	for i, host := range config.AllowedHosts {
		_, ipErr := netip.ParseAddr(host)
		literalIP := ipErr == nil
		if host != normalizeHost(host) || host == "" || (!literalIP && strings.Contains(host, ":")) || strings.ContainsAny(host, "/?#@") {
			return fmt.Errorf("allowed_hosts[%d] must be a lowercase hostname or IP without a port", i)
		}
	}
	for name, target := range map[string]*url.URL{"base_url": base, "candidate_url": candidate} {
		host := normalizeHost(target.Hostname())
		if _, ok := allowed[host]; !ok {
			return fmt.Errorf("%s host %q is not explicitly allowlisted", name, host)
		}
		if isMetadataHost(host) {
			return fmt.Errorf("%s metadata host is forbidden", name)
		}
	}
	if config.Runs == 0 {
		config.Runs = 2
	}
	if config.Runs < 2 || config.Runs > 10 {
		return errors.New("runs must be between 2 and 10")
	}
	if config.TimeoutMS == 0 {
		config.TimeoutMS = 5000
	}
	if config.TimeoutMS < 100 || config.TimeoutMS > 60000 {
		return errors.New("timeout_ms must be between 100 and 60000")
	}
	if len(config.Corpus) == 0 {
		return errors.New("corpus must contain at least one case")
	}
	seen := map[string]struct{}{}
	seenAssertions := map[string]struct{}{}
	for i := range config.Corpus {
		item := &config.Corpus[i]
		if item.OrganizationID == "" {
			return fmt.Errorf("corpus[%d].organization_id is required", i)
		}
		if item.OrganizationID != config.OrganizationID {
			return fmt.Errorf("corpus[%d] crosses organization boundary", i)
		}
		if item.CaseID == "" || item.SessionID == "" || item.ConsumerID == "" || item.Sequence < 1 {
			return fmt.Errorf("corpus[%d] case_id, session_id, consumer_id, and positive sequence are required", i)
		}
		if _, exists := seen[item.CaseID]; exists {
			return fmt.Errorf("duplicate case_id %q", item.CaseID)
		}
		seen[item.CaseID] = struct{}{}
		if item.Request.Method == "" || !strings.HasPrefix(item.Request.Path, "/") || strings.HasPrefix(item.Request.Path, "//") {
			return fmt.Errorf("corpus[%d] request method and absolute path are required", i)
		}
		for name := range item.Request.Headers {
			if redaction.SensitiveName(name) {
				return fmt.Errorf("corpus[%d] contains forbidden header %q", i, name)
			}
		}
		for name := range item.Request.Query {
			if redaction.SensitiveName(name) {
				return fmt.Errorf("corpus[%d] contains forbidden query parameter %q", i, name)
			}
		}
		for j, claim := range item.Claims {
			if claim.ClaimID == "" || claim.BehaviorKind == "" || claim.BehaviorPath == "" {
				return fmt.Errorf("corpus[%d].claims[%d] is incomplete", i, j)
			}
			if !identity.ValidUUID(claim.ClaimID) {
				return fmt.Errorf("corpus[%d].claims[%d].claim_id must be a UUID", i, j)
			}
		}
		for j, assertion := range item.Assertions {
			if !identity.ValidUUID(assertion.AssertionID) || !identity.ValidUUID(assertion.BehaviorID) ||
				assertion.BehaviorPath == "" || !supportedBehaviorKind(assertion.BehaviorKind) {
				return fmt.Errorf("corpus[%d].assertions[%d] requires UUID identities and a supported behavior", i, j)
			}
			if assertion.ClaimID != nil && !identity.ValidUUID(*assertion.ClaimID) {
				return fmt.Errorf("corpus[%d].assertions[%d].claim_id must be a UUID or null", i, j)
			}
			if _, duplicate := seenAssertions[assertion.AssertionID]; duplicate {
				return fmt.Errorf("duplicate assertion_id %q", assertion.AssertionID)
			}
			seenAssertions[assertion.AssertionID] = struct{}{}
		}
	}
	return nil
}

func (runner Runner) Run(ctx context.Context, config Config) (report.Report, error) {
	if err := config.Validate(); err != nil {
		return report.Report{}, err
	}
	networkGuard, err := newNetworkPolicy(ctx, config, runner.Resolver, runner.DialContext)
	if err != nil {
		return report.Report{}, err
	}
	client, err := securedHTTPClient(runner.Client, networkGuard)
	if err != nil {
		return report.Report{}, err
	}
	now := runner.Now
	if now == nil {
		now = time.Now
	}
	results := make([]report.CaseResult, 0, len(config.Corpus))
	assertionResults := []report.AssertionResult{}
	for _, item := range config.Corpus {
		result, err := runCase(ctx, client, config, item)
		if err != nil {
			return report.Report{}, fmt.Errorf("case %s: %w", item.CaseID, err)
		}
		results = append(results, result)
		assertionResults = append(assertionResults, evaluateAssertions(item, result)...)
	}
	corpus, _ := extractors.CanonicalJSON(config.Corpus)
	masks, _ := extractors.CanonicalJSON(config.MaskPaths)
	return report.Report{
		Version: report.Version, OrganizationID: config.OrganizationID, GeneratedAt: now().UTC(),
		BaseURL: config.BaseURL, CandidateURL: config.CandidateURL, ExtractorVersion: extractors.Version,
		BaseImageDigest: config.BaseImageDigest, CandidateImageDigest: config.CandidateImageDigest,
		CorpusDigest: "sha256:" + extractors.Digest(corpus), FixtureDigest: config.FixtureDigest,
		MaskDigest: "sha256:" + extractors.Digest(masks), RunnerVersion: Version,
		PolicyID: config.PolicyID, PolicyVersion: config.PolicyVersion,
		Runs: config.Runs, Results: results, AssertionResults: assertionResults, Source: config.Source,
	}, nil
}

func evaluateAssertions(item CorpusItem, result report.CaseResult) []report.AssertionResult {
	results := make([]report.AssertionResult, 0, len(item.Assertions))
	for _, assertion := range item.Assertions {
		outcome := "pass"
		if !result.Stable || result.Quarantined {
			outcome = "fail"
		} else {
			for _, delta := range result.Deltas {
				if delta.Kind == assertion.BehaviorKind && delta.Path == assertion.BehaviorPath {
					outcome = "fail"
					break
				}
			}
		}
		results = append(results, report.AssertionResult{
			AssertionID: assertion.AssertionID, BehaviorID: assertion.BehaviorID, ClaimID: assertion.ClaimID,
			CaseID: item.CaseID, Outcome: outcome,
		})
	}
	return results
}

func supportedBehaviorKind(kind string) bool {
	switch kind {
	case "shape", "ordering", "error", "status":
		return true
	default:
		return false
	}
}

func runCase(ctx context.Context, client *http.Client, config Config, item CorpusItem) (report.CaseResult, error) {
	base := make([]extractors.Fingerprint, config.Runs)
	candidate := make([]extractors.Fingerprint, config.Runs)
	for run := 0; run < config.Runs; run++ {
		var err error
		base[run], err = execute(ctx, client, config.BaseURL, config.TimeoutMS, config.MaskPaths, item.Request)
		if err != nil {
			return report.CaseResult{}, fmt.Errorf("base run %d: %w", run+1, err)
		}
		candidate[run], err = execute(ctx, client, config.CandidateURL, config.TimeoutMS, config.MaskPaths, item.Request)
		if err != nil {
			return report.CaseResult{}, fmt.Errorf("candidate run %d: %w", run+1, err)
		}
	}
	stable := allEqual(base) && allEqual(candidate)
	deltas := extractors.Diff(base[0], candidate[0])
	result := report.CaseResult{CaseID: item.CaseID, Stable: stable, Quarantined: !stable, Deltas: make([]report.Delta, len(deltas))}
	for i, delta := range deltas {
		matches := []report.ClaimMatch{}
		if stable {
			for _, claim := range item.Claims {
				if claim.BehaviorKind == delta.Kind && claim.BehaviorPath == delta.Path {
					matches = append(matches, report.ClaimMatch{ClaimID: claim.ClaimID})
				}
			}
		}
		sort.Slice(matches, func(i, j int) bool { return matches[i].ClaimID < matches[j].ClaimID })
		result.Deltas[i] = report.Delta{Kind: delta.Kind, Path: delta.Path, Before: delta.Before, After: delta.After, Digest: delta.Digest, Matches: matches}
	}
	return result, nil
}

func execute(parent context.Context, client *http.Client, target string, timeoutMS int, masks []string, request Request) (extractors.Fingerprint, error) {
	ctx, cancel := context.WithTimeout(parent, time.Duration(timeoutMS)*time.Millisecond)
	defer cancel()
	endpoint, _ := url.Parse(target)
	relative, _ := url.Parse(request.Path)
	endpoint = endpoint.ResolveReference(relative)
	query := endpoint.Query()
	for key, value := range request.Query {
		switch typed := value.(type) {
		case []any:
			for _, item := range typed {
				query.Add(key, fmt.Sprint(item))
			}
		default:
			query.Set(key, fmt.Sprint(value))
		}
	}
	endpoint.RawQuery = query.Encode()
	var body io.Reader
	if request.Body != nil {
		encoded, err := json.Marshal(request.Body)
		if err != nil {
			return extractors.Fingerprint{}, err
		}
		body = bytes.NewReader(encoded)
	}
	httpRequest, err := http.NewRequestWithContext(ctx, strings.ToUpper(request.Method), endpoint.String(), body)
	if err != nil {
		return extractors.Fingerprint{}, err
	}
	for key, value := range request.Headers {
		httpRequest.Header.Set(key, value)
	}
	if request.Body != nil && httpRequest.Header.Get("Content-Type") == "" {
		httpRequest.Header.Set("Content-Type", "application/json")
	}
	response, err := client.Do(httpRequest)
	if err != nil {
		return extractors.Fingerprint{}, err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 4*1024*1024+1))
	if err != nil {
		return extractors.Fingerprint{}, err
	}
	if len(data) > 4*1024*1024 {
		return extractors.Fingerprint{}, errors.New("response exceeds 4 MiB limit")
	}
	var value any
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if len(bytes.TrimSpace(data)) == 0 {
		value = nil
	} else if err := decoder.Decode(&value); err != nil || !jsonEOF(decoder) {
		value = string(data)
	}
	return extractors.Extract(response.StatusCode, value, extractors.Options{Paginated: hasPagination(request.Query), MaskPaths: masks}), nil
}

func jsonEOF(decoder *json.Decoder) bool {
	var extra any
	return errors.Is(decoder.Decode(&extra), io.EOF)
}

func allEqual(values []extractors.Fingerprint) bool {
	if len(values) < 2 {
		return false
	}
	first, _ := extractors.CanonicalJSON(values[0])
	for _, value := range values[1:] {
		current, _ := extractors.CanonicalJSON(value)
		if !bytes.Equal(first, current) {
			return false
		}
	}
	return true
}

func validateTarget(raw string) (*url.URL, error) {
	target, err := url.Parse(raw)
	if err != nil || target.Host == "" || (target.Scheme != "http" && target.Scheme != "https") {
		return nil, errors.New("must be an absolute HTTP(S) URL")
	}
	if target.User != nil || target.RawQuery != "" || target.Fragment != "" {
		return nil, errors.New("credentials, query strings, and fragments are forbidden")
	}
	return target, nil
}

func hasPagination(query map[string]any) bool {
	for key := range query {
		switch strings.ToLower(key) {
		case "cursor", "page", "page_token", "next_cursor", "offset":
			return true
		}
	}
	return false
}
