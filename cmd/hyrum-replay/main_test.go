package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMissingReplayConfigFails(t *testing.T) {
	if err := run(context.Background(), nil, &bytes.Buffer{}, func(string) string { return "" }); err == nil {
		t.Fatal("expected missing config to fail")
	}
}

func TestReplayCLIRejectsMissingImageDigests(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "replay.json")
	config := `{"version":"1.0.0","organization_id":"00000000-0000-4000-8000-000000000001","base_url":"http://127.0.0.1:4100","candidate_url":"http://127.0.0.1:4101","runs":2,"timeout_ms":1000,"signing_key_id":"ci","allowed_hosts":["127.0.0.1"],"corpus":[{"case_id":"case","organization_id":"00000000-0000-4000-8000-000000000001","session_id":"session","consumer_id":"consumer","sequence":1,"request":{"method":"GET","path":"/health"}}]}`
	if err := os.WriteFile(configPath, []byte(config), 0o600); err != nil {
		t.Fatal(err)
	}
	err := run(context.Background(), []string{"-config", configPath}, &bytes.Buffer{}, func(string) string {
		return "0123456789abcdef0123456789abcdef"
	})
	if err == nil || !strings.Contains(err.Error(), "base_image_digest") {
		t.Fatalf("CLI did not fail fast on missing image digests: %v", err)
	}
}

func TestReplayHelpSucceeds(t *testing.T) {
	var output bytes.Buffer
	if err := run(context.Background(), []string{"-help"}, &output, func(string) string { return "" }); err != nil {
		t.Fatal(err)
	}
	if output.Len() == 0 {
		t.Fatal("expected help output")
	}
}
