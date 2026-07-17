package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestMissingAgentConfigFails(t *testing.T) {
	if err := run(nil, strings.NewReader(""), &bytes.Buffer{}, func(string) string { return "" }); err == nil {
		t.Fatal("expected missing config to fail")
	}
}

func TestAgentHelpSucceeds(t *testing.T) {
	var output bytes.Buffer
	if err := run([]string{"-help"}, strings.NewReader(""), &output, func(string) string { return "" }); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), "Usage of hyrum-agent") {
		t.Fatalf("missing help output: %q", output.String())
	}
}
