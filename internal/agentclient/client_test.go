package agentclient

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestUploadEncodedAuthenticatesAndDigestsExactBody(t *testing.T) {
	t.Parallel()
	body := []byte(`{"agentBatchId":"batch-1"}`)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer machine-token" {
			t.Error("missing bearer token")
		}
		received, _ := io.ReadAll(request.Body)
		digest := sha256.Sum256(received)
		if request.Header.Get("X-Hyrum-Content-SHA256") != hex.EncodeToString(digest[:]) {
			t.Error("exact body digest does not match")
		}
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusAccepted)
		_, _ = writer.Write([]byte(`{"batchId":"00000000-0000-4000-8000-000000000001","duplicate":false,"status":"validated","sessionCount":1,"acceptedItemCount":1,"rejectedItemCount":0,"rejections":[]}`))
	}))
	defer server.Close()

	client := Client{BaseURL: server.URL, Token: "machine-token", HTTPClient: server.Client()}
	if err := client.UploadEncoded(context.Background(), body); err != nil {
		t.Fatalf("upload failed: %v", err)
	}
}

func TestEncryptedSpoolRoundTripAndCap(t *testing.T) {
	t.Parallel()
	directory := t.TempDir()
	spool := Spool{Directory: directory, Key: []byte("0123456789abcdef0123456789abcdef"), MaxBytes: 1024}
	path, err := spool.Put("batch-1", []byte("redacted batch"))
	if err != nil {
		t.Fatal(err)
	}
	onDisk, err := io.ReadAll(mustOpen(t, path))
	if err != nil {
		t.Fatal(err)
	}
	if string(onDisk) == "redacted batch" {
		t.Fatal("spool persisted plaintext")
	}
	plaintext, err := spool.Read(path)
	if err != nil || string(plaintext) != "redacted batch" {
		t.Fatalf("spool round trip failed: %q %v", plaintext, err)
	}
	spool.MaxBytes = 1
	if _, err := spool.Put("batch-2", []byte("another batch")); err == nil {
		t.Fatal("expected spool cap rejection")
	}
}

func mustOpen(t *testing.T, path string) *os.File {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = file.Close() })
	return file
}
