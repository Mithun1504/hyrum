package replay

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/hyrum-dev/hyrum/internal/report"
)

const (
	testBaseDigest      = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	testCandidateDigest = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	testFixtureDigest   = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
	testPolicyID        = "00000000-0000-4000-8000-000000000091"
)

func TestApprovedLocalDemoReplayStableTiersAndSignature(t *testing.T) {
	base := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(writer).Encode(map[string]any{"next_cursor": "one"})
	}))
	defer base.Close()
	candidate := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(writer).Encode(map[string]any{"cursor": "one"})
	}))
	defer candidate.Close()
	claimID := "00000000-0000-4000-8000-000000000002"
	config := Config{
		OrganizationID: "00000000-0000-4000-8000-000000000001", BaseURL: base.URL, CandidateURL: candidate.URL, Runs: 2,
		BaseImageDigest: testBaseDigest, CandidateImageDigest: testCandidateDigest,
		FixtureDigest: testFixtureDigest, PolicyID: testPolicyID, PolicyVersion: 1,
		TimeoutMS: 1000, SigningKeyID: "ci", AllowedHosts: []string{"127.0.0.1"}, Corpus: []CorpusItem{{
			CaseID: "pagination", OrganizationID: "00000000-0000-4000-8000-000000000001", SessionID: "session", ConsumerID: "consumer", Sequence: 1,
			Request: Request{Method: "GET", Path: "/items"},
			Claims:  []Claim{{ClaimID: claimID, BehaviorKind: "shape", BehaviorPath: "$.next_cursor"}},
			Assertions: []Assertion{
				{AssertionID: "00000000-0000-4000-8000-000000000003", BehaviorID: "00000000-0000-4000-8000-000000000004", ClaimID: &claimID, BehaviorKind: "shape", BehaviorPath: "$.next_cursor"},
				{AssertionID: "00000000-0000-4000-8000-000000000005", BehaviorID: "00000000-0000-4000-8000-000000000006", BehaviorKind: "shape", BehaviorPath: "$.data"},
			},
		}},
		Source: &report.SourceContext{
			GitHub: &report.GitHubSource{RepositoryOwner: "hyrum", RepositoryName: "demo", HeadSHA: "abcdef1", PullRequest: 42, InstallationID: 91},
			Slack:  &report.SlackSource{Channel: "C12345678"},
		},
	}
	value, err := (Runner{Now: func() time.Time { return time.Unix(0, 0) }}).Run(context.Background(), config)
	if err != nil {
		t.Fatal(err)
	}
	if !value.Results[0].Stable || value.PolicyID != testPolicyID || value.PolicyVersion != 1 ||
		value.FixtureDigest != testFixtureDigest || value.MaskDigest == "" || value.RunnerVersion != Version {
		t.Fatalf("unexpected report: %#v", value)
	}
	encoded, _ := json.Marshal(value)
	if strings.Contains(string(encoded), `"decision"`) || strings.Contains(string(encoded), `"tier"`) {
		t.Fatalf("facts-only report leaked policy output: %s", encoded)
	}
	if value.Source == nil || value.Source.GitHub == nil || value.Source.GitHub.PullRequest != 42 {
		t.Fatalf("source context was not preserved: %#v", value.Source)
	}
	if len(value.AssertionResults) != 2 || value.AssertionResults[0].Outcome != "fail" || value.AssertionResults[1].Outcome != "pass" {
		t.Fatalf("unexpected assertion results: %#v", value.AssertionResults)
	}
	key := ed25519.NewKeyFromSeed([]byte("0123456789abcdef0123456789abcdef"))
	if err := report.Sign(&value, config.SigningKeyID, key); err != nil || !report.Verify(value, key.Public().(ed25519.PublicKey)) {
		t.Fatal("report signature did not verify")
	}
}

func TestConfigRejectsDuplicateAssertions(t *testing.T) {
	config := validNetworkConfig("http://127.0.0.1:4100", "http://127.0.0.1:4101")
	config.AllowedHosts = []string{"127.0.0.1"}
	assertion := Assertion{
		AssertionID: "00000000-0000-4000-8000-000000000003", BehaviorID: "00000000-0000-4000-8000-000000000004",
		BehaviorKind: "shape", BehaviorPath: "$.cursor",
	}
	config.Corpus[0].Assertions = []Assertion{assertion, assertion}
	if err := config.Validate(); err == nil || !strings.Contains(err.Error(), "duplicate assertion_id") {
		t.Fatalf("duplicate assertion coverage was accepted: %v", err)
	}
}

func TestConfigRejectsTenantMismatchAndUnknownFields(t *testing.T) {
	raw := `{"organization_id":"org","base_url":"http://base","candidate_url":"http://candidate","signing_key_id":"ci","corpus":[{"case_id":"one","organization_id":"other","session_id":"s","consumer_id":"c","sequence":1,"request":{"method":"GET","path":"/"}}],"unknown":true}`
	if _, err := DecodeConfig(strings.NewReader(raw)); err == nil {
		t.Fatal("expected strict config rejection")
	}
}

func TestConfigRejectsIncompleteSourceContext(t *testing.T) {
	config := validNetworkConfig("http://127.0.0.1:4100", "http://127.0.0.1:4101")
	config.AllowedHosts = []string{"127.0.0.1"}
	config.Source = &report.SourceContext{GitHub: &report.GitHubSource{RepositoryOwner: "hyrum"}}
	if err := config.Validate(); err == nil || !strings.Contains(err.Error(), "github source") {
		t.Fatalf("incomplete source context was accepted: %v", err)
	}
}

func TestConfigRequiresImmutableImageDigests(t *testing.T) {
	config := validNetworkConfig("http://127.0.0.1:4100", "http://127.0.0.1:4101")
	config.AllowedHosts = []string{"127.0.0.1"}
	for _, invalid := range []string{"", "latest", "sha256:abc", "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"} {
		config.BaseImageDigest = invalid
		if err := config.Validate(); err == nil {
			t.Fatalf("invalid image digest %q was accepted", invalid)
		}
	}
}

func TestConfigRejectsTargetEscapeAndSecrets(t *testing.T) {
	config := Config{
		OrganizationID: "00000000-0000-4000-8000-000000000001", BaseURL: "http://base", CandidateURL: "http://candidate", SigningKeyID: "ci",
		BaseImageDigest: testBaseDigest, CandidateImageDigest: testCandidateDigest,
		FixtureDigest: testFixtureDigest, PolicyID: testPolicyID, PolicyVersion: 1,
		AllowedHosts: []string{"base", "candidate"},
		Corpus: []CorpusItem{{CaseID: "one", OrganizationID: "00000000-0000-4000-8000-000000000001", SessionID: "s", ConsumerID: "c", Sequence: 1,
			Request: Request{Method: "GET", Path: "//attacker.test/path", Headers: map[string]string{"Authorization": "secret"}}}},
	}
	if err := config.Validate(); err == nil {
		t.Fatal("expected target escape and secret headers to be rejected")
	}
}
