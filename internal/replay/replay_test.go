package replay

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestDownloadCorpusVerifiesDigest(t *testing.T) {
	t.Parallel()
	body := []byte(strings.Join([]string{
		`{"format":"hyrum-replay-corpus","schema_version":1}`,
		`{"assertion_id":null,"api_operation_id":"operation-id","behavior_definition_id":"behavior-id","behavior_kind":"shape","consumer_id":"consumer-id","coverage_class":"shape","operation_key":"GET /items","request":{"method":"GET","path":"/items","normalized_path":"/items"},"request_digest":"digest","requires_fixture":false}`,
	}, "\n"))
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusOK)
		_, _ = writer.Write(body)
	}))
	defer server.Close()
	digest := sha256.Sum256(body)
	items, err := DownloadCorpus(context.Background(), server.Client(), Bundle{
		CorpusURL: server.URL, CorpusDigest: hex.EncodeToString(digest[:]),
	})
	if err != nil || len(items) != 1 {
		t.Fatalf("DownloadCorpus() items = %#v, error = %v", items, err)
	}
	_, err = DownloadCorpus(context.Background(), server.Client(), Bundle{
		CorpusURL: server.URL, CorpusDigest: strings.Repeat("0", 64),
	})
	if err == nil || !strings.Contains(err.Error(), "digest verification failed") {
		t.Fatalf("DownloadCorpus() digest error = %v", err)
	}
}

func TestDecodeCorpus(t *testing.T) {
	t.Parallel()
	input := strings.Join([]string{
		`{"format":"hyrum-replay-corpus","schema_version":1}`,
		`{"assertion_id":null,"api_operation_id":"operation-id","behavior_definition_id":"behavior-id","behavior_kind":"shape","consumer_id":"consumer-id","coverage_class":"shape","operation_key":"GET /items","request":{"method":"GET","path":"/items","normalized_path":"/items"},"request_digest":"digest","requires_fixture":false}`,
	}, "\n")
	items, err := DecodeCorpus(strings.NewReader(input))
	if err != nil {
		t.Fatalf("DecodeCorpus() error = %v", err)
	}
	if len(items) != 1 || items[0].Request.Path != "/items" {
		t.Fatalf("DecodeCorpus() = %#v", items)
	}
}

func TestRunProducesStableDeterministicDelta(t *testing.T) {
	t.Parallel()
	base := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("content-type", "application/json")
		_, _ = writer.Write([]byte(`{"items":[{"id":1}]}`))
	}))
	defer base.Close()
	candidate := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("content-type", "application/json")
		_, _ = writer.Write([]byte(`{"items":[{"id":"changed"}]}`))
	}))
	defer candidate.Close()
	corpusBody := []byte(strings.Join([]string{
		`{"format":"hyrum-replay-corpus","schema_version":1}`,
		`{"assertion_id":null,"api_operation_id":"operation-id","behavior_definition_id":"behavior-id","behavior_kind":"shape","consumer_id":"consumer-id","coverage_class":"shape","operation_key":"GET /items","request":{"method":"GET","path":"/items","normalized_path":"/items"},"request_digest":"request-digest","requires_fixture":false}`,
	}, "\n"))
	items, err := DecodeCorpus(bytes.NewReader(corpusBody))
	if err != nil {
		t.Fatal(err)
	}
	report, err := Run(context.Background(), items, Options{
		ReplayRunID: "run-id", CorpusDigest: strings.Repeat("c", 64),
		BaseImageDigest: "base", CandidateImageDigest: "candidate", FixtureDigest: "fixture",
		MaskDigest: strings.Repeat("m", 64), RunnerVersion: "test", Nonce: "nonce",
		BaseURL: base.URL, CandidateURL: candidate.URL, Attempts: 2, Timeout: time.Second,
	})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if len(report.Deltas) != 1 {
		t.Fatalf("Run() deltas = %#v", report.Deltas)
	}
	if report.Deltas[0].Kind != "shape" || report.Deltas[0].Stability != "stable" ||
		report.Deltas[0].AgreeingAttempts != 2 {
		t.Fatalf("Run() delta = %#v", report.Deltas[0])
	}
}

func TestRunDeniesFixtureWritesByDefault(t *testing.T) {
	t.Parallel()
	corpusBody := []byte(strings.Join([]string{
		`{"format":"hyrum-replay-corpus","schema_version":1}`,
		`{"assertion_id":null,"api_operation_id":"operation-id","behavior_definition_id":"behavior-id","behavior_kind":"shape","consumer_id":"consumer-id","coverage_class":"shape","operation_key":"POST /items","request":{"method":"POST","path":"/items","normalized_path":"/items"},"request_digest":"digest","requires_fixture":true}`,
	}, "\n"))
	items, err := DecodeCorpus(bytes.NewReader(corpusBody))
	if err != nil {
		t.Fatal(err)
	}
	_, err = Run(context.Background(), items, Options{
		ReplayRunID: "run", CorpusDigest: strings.Repeat("c", 64), BaseImageDigest: "base",
		CandidateImageDigest: "candidate", FixtureDigest: "fixture", MaskDigest: strings.Repeat("m", 64),
		RunnerVersion: "test", Nonce: "nonce", BaseURL: "http://localhost:8080",
		CandidateURL: "http://localhost:8081", Attempts: 2,
	})
	if err == nil || !strings.Contains(err.Error(), "requires an explicit fixture") {
		t.Fatalf("Run() error = %v", err)
	}
}

func TestUploadReportSignsExactBytes(t *testing.T) {
	t.Parallel()
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	privateDER, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		t.Fatal(err)
	}
	signedReport := Report{SchemaVersion: 1}
	report, _ := json.Marshal(signedReport)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("authorization") != "Bearer hyrum_runner_test" {
			t.Errorf("authorization = %q", request.Header.Get("authorization"))
		}
		var payload struct {
			Report    string `json:"reportBase64"`
			Signature string `json:"signatureBase64"`
			Nonce     string `json:"nonce"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Errorf("decode upload: %v", err)
		}
		decodedReport, _ := base64.StdEncoding.DecodeString(payload.Report)
		signature, _ := base64.StdEncoding.DecodeString(payload.Signature)
		if string(decodedReport) != string(report) || !ed25519.Verify(publicKey, decodedReport, signature) {
			t.Error("uploaded report signature did not verify")
		}
		if payload.Nonce != "nonce" {
			t.Errorf("nonce = %q", payload.Nonce)
		}
		writer.WriteHeader(http.StatusAccepted)
		_, _ = writer.Write([]byte(`{"status":"succeeded"}`))
	}))
	defer server.Close()
	err = UploadReport(context.Background(), server.Client(), server.URL, Bundle{
		Token: "hyrum_runner_test", Nonce: "nonce",
		ReportUploadPath:        "/v1/runner/replays/run/report",
		ReportSigningPrivateKey: base64.StdEncoding.EncodeToString(privateDER),
	}, signedReport)
	if err != nil {
		t.Fatalf("UploadReport() error = %v", err)
	}
}
