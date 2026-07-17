package replay

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"
	"testing"
)

func TestNetworkTargetsDeniedWithoutAllowlist(t *testing.T) {
	targets := []string{
		"http://169.254.169.254/latest/meta-data",
		"http://127.0.0.1:4100",
		"http://10.0.0.1",
		"http://172.16.0.1",
		"http://192.168.1.1",
		"http://[::1]:4100",
		"http://[fc00::1]",
		"http://[fe80::1]",
		"https://api.example.test",
	}
	for _, target := range targets {
		t.Run(target, func(t *testing.T) {
			config := validNetworkConfig(target, "http://candidate.example.test")
			config.AllowedHosts = nil
			if err := config.Validate(); err == nil || !strings.Contains(err.Error(), "allowed_hosts") {
				t.Fatalf("target was not denied by default: %v", err)
			}
		})
	}
}

func TestExplicitAllowlistAcceptsLocalAndPrivateTargets(t *testing.T) {
	targets := []struct {
		base, candidate, host string
	}{
		{"http://127.0.0.1:4100", "http://127.0.0.1:4101", "127.0.0.1"},
		{"http://10.0.0.1:4100", "http://10.0.0.1:4101", "10.0.0.1"},
		{"http://[::1]:4100", "http://[::1]:4101", "::1"},
		{"http://[fc00::1]:4100", "http://[fc00::1]:4101", "fc00::1"},
	}
	for _, item := range targets {
		config := validNetworkConfig(item.base, item.candidate)
		config.AllowedHosts = []string{item.host}
		if err := config.Validate(); err != nil {
			t.Fatalf("explicit target %s was rejected: %v", item.host, err)
		}
	}
}

func TestMetadataAndLinkLocalAddressesCannotBeAllowlisted(t *testing.T) {
	for _, target := range []string{"169.254.169.254", "169.254.170.2", "fe80::1", "fd00:ec2::254"} {
		config := validNetworkConfig(urlForHost(target, 4100), urlForHost(target, 4101))
		config.AllowedHosts = []string{target}
		if _, err := newNetworkPolicy(context.Background(), config, nil, nil); err == nil {
			t.Fatalf("metadata/link-local target %s was accepted", target)
		}
	}
}

func TestDialRejectsDNSRebinding(t *testing.T) {
	resolver := &answerSequence{answers: [][]net.IPAddr{
		{{IP: net.ParseIP("203.0.113.10")}},
		{{IP: net.ParseIP("127.0.0.1")}},
	}}
	dialed := false
	config := validNetworkConfig("http://api.example.test:4100", "http://api.example.test:4101")
	config.AllowedHosts = []string{"api.example.test"}
	policy, err := newNetworkPolicy(context.Background(), config, resolver, func(context.Context, string, string) (net.Conn, error) {
		dialed = true
		return nil, errors.New("not reached")
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := policy.dialContext(context.Background(), "tcp", "api.example.test:4100"); err == nil || !strings.Contains(err.Error(), "changed after preflight") {
		t.Fatalf("DNS rebinding was not rejected: %v", err)
	}
	if dialed {
		t.Fatal("network dial occurred after DNS rebinding")
	}
}

type answerSequence struct {
	answers [][]net.IPAddr
	calls   int
}

func (resolver *answerSequence) LookupIPAddr(context.Context, string) ([]net.IPAddr, error) {
	index := resolver.calls
	if index >= len(resolver.answers) {
		index = len(resolver.answers) - 1
	}
	resolver.calls++
	return resolver.answers[index], nil
}

func validNetworkConfig(base, candidate string) Config {
	return Config{
		OrganizationID:  "00000000-0000-4000-8000-000000000001",
		BaseImageDigest: testBaseDigest, CandidateImageDigest: testCandidateDigest,
		FixtureDigest: testFixtureDigest, PolicyID: testPolicyID, PolicyVersion: 1,
		BaseURL: base, CandidateURL: candidate, SigningKeyID: "ci", Runs: 2, TimeoutMS: 1000,
		AllowedHosts: []string{"candidate.example.test"},
		Corpus: []CorpusItem{{
			CaseID: "case", OrganizationID: "00000000-0000-4000-8000-000000000001",
			SessionID: "session", ConsumerID: "consumer", Sequence: 1,
			Request: Request{Method: "GET", Path: "/health"},
		}},
	}
}

func urlForHost(host string, port int) string {
	if strings.Contains(host, ":") {
		return "http://[" + host + "]:" + fmt.Sprint(port)
	}
	return "http://" + host + ":" + fmt.Sprint(port)
}
