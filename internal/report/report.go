// Package report defines and signs the canonical replay report wire format.
package report

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"time"

	"github.com/hyrum-dev/hyrum/internal/extractors"
	"github.com/hyrum-dev/hyrum/internal/identity"
)

const Version = "2.0.0"

var imageDigest = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
var (
	gitHubName   = regexp.MustCompile(`^[A-Za-z0-9_.-]+$`)
	gitHubSHA    = regexp.MustCompile(`^[0-9a-f]{7,64}$`)
	slackChannel = regexp.MustCompile(`^[A-Z0-9]{2,32}$`)
)

type Report struct {
	Version              string            `json:"version"`
	OrganizationID       string            `json:"organization_id"`
	GeneratedAt          time.Time         `json:"generated_at"`
	BaseURL              string            `json:"base_url"`
	CandidateURL         string            `json:"candidate_url"`
	BaseImageDigest      string            `json:"base_image_digest"`
	CandidateImageDigest string            `json:"candidate_image_digest"`
	ExtractorVersion     string            `json:"extractor_version"`
	CorpusDigest         string            `json:"corpus_digest"`
	FixtureDigest        string            `json:"fixture_digest"`
	MaskDigest           string            `json:"mask_digest"`
	RunnerVersion        string            `json:"runner_version"`
	PolicyID             string            `json:"policy_id"`
	PolicyVersion        int               `json:"policy_version"`
	Runs                 int               `json:"runs"`
	Results              []CaseResult      `json:"results"`
	AssertionResults     []AssertionResult `json:"assertion_results"`
	Source               *SourceContext    `json:"source,omitempty"`
	Signature            *Signature        `json:"signature,omitempty"`
}

type SourceContext struct {
	GitHub *GitHubSource `json:"github,omitempty"`
	Slack  *SlackSource  `json:"slack,omitempty"`
}

type GitHubSource struct {
	RepositoryOwner string `json:"repository_owner"`
	RepositoryName  string `json:"repository_name"`
	HeadSHA         string `json:"head_sha"`
	PullRequest     int    `json:"pull_request"`
	InstallationID  int64  `json:"installation_id"`
}

type SlackSource struct {
	Channel string `json:"channel"`
}

type CaseResult struct {
	CaseID      string  `json:"case_id"`
	Stable      bool    `json:"stable"`
	Quarantined bool    `json:"quarantined"`
	Deltas      []Delta `json:"deltas"`
}

type Delta struct {
	Kind    string       `json:"kind"`
	Path    string       `json:"path"`
	Before  any          `json:"before,omitempty"`
	After   any          `json:"after,omitempty"`
	Digest  string       `json:"digest"`
	Matches []ClaimMatch `json:"matches"`
}

type ClaimMatch struct {
	ClaimID string `json:"claim_id"`
}

type AssertionResult struct {
	AssertionID string  `json:"assertion_id"`
	BehaviorID  string  `json:"behavior_id"`
	ClaimID     *string `json:"claim_id"`
	CaseID      string  `json:"case_id"`
	Outcome     string  `json:"outcome"`
}

type Signature struct {
	Algorithm string `json:"algorithm"`
	KeyID     string `json:"key_id"`
	Value     string `json:"value"`
}

func Sign(value *Report, keyID string, key []byte) error {
	if value == nil || !identity.ValidUUID(value.OrganizationID) || keyID == "" {
		return errors.New("report, organization_id, and signing key ID are required")
	}
	if !ValidImageDigest(value.BaseImageDigest) || !ValidImageDigest(value.CandidateImageDigest) ||
		value.BaseImageDigest == value.CandidateImageDigest {
		return errors.New("report requires distinct immutable base and candidate sha256 image digests")
	}
	if !ValidDigest(value.CorpusDigest) || !ValidDigest(value.FixtureDigest) || !ValidDigest(value.MaskDigest) ||
		value.RunnerVersion == "" || !identity.ValidUUID(value.PolicyID) || value.PolicyVersion < 1 {
		return errors.New("report requires corpus, fixture, and mask sha256 digests, runner version, and policy identity/version")
	}
	if value.AssertionResults == nil {
		value.AssertionResults = []AssertionResult{}
	}
	if err := validateAssertionResults(value.AssertionResults); err != nil {
		return err
	}
	if err := ValidateSourceContext(value.Source); err != nil {
		return err
	}
	if len(key) == ed25519.SeedSize {
		key = ed25519.NewKeyFromSeed(key)
	}
	if len(key) != ed25519.PrivateKeySize {
		return errors.New("report signing key must be a 32-byte seed or 64-byte Ed25519 private key")
	}
	value.Version = Version
	value.ExtractorVersion = extractors.Version
	value.Signature = nil
	canonical, err := Canonical(value)
	if err != nil {
		return err
	}
	signed := ed25519.Sign(ed25519.PrivateKey(key), canonical)
	value.Signature = &Signature{Algorithm: "ed25519", KeyID: keyID, Value: base64.RawURLEncoding.EncodeToString(signed)}
	return nil
}

func ValidImageDigest(value string) bool { return imageDigest.MatchString(value) }

func Verify(value Report, publicKey []byte) bool {
	if value.Version != Version || value.ExtractorVersion != extractors.Version || value.Signature == nil ||
		value.Signature.Algorithm != "ed25519" || len(publicKey) != ed25519.PublicKeySize ||
		!identity.ValidUUID(value.OrganizationID) || ValidateSourceContext(value.Source) != nil || !ValidImageDigest(value.BaseImageDigest) ||
		!ValidImageDigest(value.CandidateImageDigest) || value.BaseImageDigest == value.CandidateImageDigest ||
		!ValidDigest(value.CorpusDigest) || !ValidDigest(value.FixtureDigest) || !ValidDigest(value.MaskDigest) ||
		value.RunnerVersion == "" || !identity.ValidUUID(value.PolicyID) || value.PolicyVersion < 1 {
		return false
	}
	if value.AssertionResults == nil || validateAssertionResults(value.AssertionResults) != nil {
		return false
	}
	signature, err := base64.RawURLEncoding.DecodeString(value.Signature.Value)
	if err != nil {
		return false
	}
	value.Signature = nil
	canonical, err := Canonical(value)
	if err != nil {
		return false
	}
	return ed25519.Verify(ed25519.PublicKey(publicKey), canonical, signature)
}

func ValidDigest(value string) bool { return imageDigest.MatchString(value) }

func ValidateSourceContext(source *SourceContext) error {
	if source == nil {
		return nil
	}
	if source.GitHub == nil && source.Slack == nil {
		return errors.New("source requires github or slack context")
	}
	if github := source.GitHub; github != nil {
		if !gitHubName.MatchString(github.RepositoryOwner) || !gitHubName.MatchString(github.RepositoryName) ||
			!gitHubSHA.MatchString(github.HeadSHA) || github.PullRequest < 1 || github.InstallationID < 1 {
			return errors.New("github source requires repository owner/name, lowercase head SHA, positive PR, and installation ID")
		}
	}
	if source.Slack != nil && !slackChannel.MatchString(source.Slack.Channel) {
		return errors.New("slack source requires a channel ID")
	}
	return nil
}

func validateAssertionResults(results []AssertionResult) error {
	seen := map[string]struct{}{}
	for i, result := range results {
		if !identity.ValidUUID(result.AssertionID) || !identity.ValidUUID(result.BehaviorID) || result.CaseID == "" ||
			(result.Outcome != "pass" && result.Outcome != "fail") {
			return errors.New("assertion results require UUID identities, case_id, and pass/fail outcome")
		}
		if result.ClaimID != nil && !identity.ValidUUID(*result.ClaimID) {
			return fmt.Errorf("assertion_results[%d].claim_id must be a UUID or null", i)
		}
		if _, duplicate := seen[result.AssertionID]; duplicate {
			return fmt.Errorf("duplicate assertion result %q", result.AssertionID)
		}
		seen[result.AssertionID] = struct{}{}
	}
	return nil
}

func Canonical(value any) ([]byte, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.UseNumber()
	var normalized any
	if err := decoder.Decode(&normalized); err != nil {
		return nil, err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return nil, errors.New("canonical JSON contains multiple values")
	}
	var output bytes.Buffer
	encoder := json.NewEncoder(&output)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(normalized); err != nil {
		return nil, err
	}
	return bytes.TrimSuffix(output.Bytes(), []byte{'\n'}), nil
}
