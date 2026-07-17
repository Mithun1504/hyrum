package report

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"os"
	"testing"
	"time"
)

func TestSignedReportDetectsTampering(t *testing.T) {
	key := ed25519.NewKeyFromSeed([]byte("0123456789abcdef0123456789abcdef"))
	value := Report{
		OrganizationID: "00000000-0000-4000-8000-000000000001", GeneratedAt: time.Unix(0, 0).UTC(), Results: []CaseResult{},
		BaseImageDigest:      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		CandidateImageDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		CorpusDigest:         "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		FixtureDigest:        "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		MaskDigest:           "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		RunnerVersion:        "1.0.0",
		PolicyID:             "00000000-0000-4000-8000-000000000091",
		PolicyVersion:        1,
		Source: &SourceContext{GitHub: &GitHubSource{
			RepositoryOwner: "hyrum", RepositoryName: "demo", HeadSHA: "abcdef1", PullRequest: 42, InstallationID: 91,
		}},
	}
	if err := Sign(&value, "ci", key); err != nil {
		t.Fatal(err)
	}
	if !Verify(value, key.Public().(ed25519.PublicKey)) {
		t.Fatal("valid signature was rejected")
	}
	value.Source.GitHub.HeadSHA = "abcdef2"
	if Verify(value, key.Public().(ed25519.PublicKey)) {
		t.Fatal("tampered source context was accepted")
	}
}

func TestImageDigestValidation(t *testing.T) {
	if !ValidImageDigest("sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") {
		t.Fatal("valid immutable digest was rejected")
	}
	for _, invalid := range []string{"", "latest", "sha256:abc", "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"} {
		if ValidImageDigest(invalid) {
			t.Fatalf("invalid digest %q was accepted", invalid)
		}
	}
}

type signatureVector struct {
	SeedBase64   string `json:"seed_base64"`
	PublicKeyPEM string `json:"public_key_pem"`
	Payload      Report `json:"payload"`
	Canonical    string `json:"canonical"`
	Signature    string `json:"signature_base64url"`
}

func TestCanonicalSignatureGoldenVector(t *testing.T) {
	data, err := os.ReadFile("testdata/signature-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vector signatureVector
	if err := json.Unmarshal(data, &vector); err != nil {
		t.Fatal(err)
	}
	seed, err := base64.StdEncoding.DecodeString(vector.SeedBase64)
	if err != nil {
		t.Fatal(err)
	}
	key := ed25519.NewKeyFromSeed(seed)
	canonical, err := Canonical(vector.Payload)
	if err != nil {
		t.Fatal(err)
	}
	if string(canonical) != vector.Canonical {
		t.Fatalf("canonical vector mismatch\nwant: %q\ngot:  %q", vector.Canonical, canonical)
	}
	if err := Sign(&vector.Payload, "golden-ci", key); err != nil {
		t.Fatal(err)
	}
	if vector.Payload.Signature.Value != vector.Signature {
		t.Fatalf("signature vector mismatch\nwant: %q\ngot:  %q", vector.Signature, vector.Payload.Signature.Value)
	}
	publicDER, err := x509.MarshalPKIXPublicKey(key.Public())
	if err != nil {
		t.Fatal(err)
	}
	publicPEM := string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER}))
	if publicPEM != vector.PublicKeyPEM {
		t.Fatalf("public key vector mismatch\nwant: %q\ngot:  %q", vector.PublicKeyPEM, publicPEM)
	}
}
