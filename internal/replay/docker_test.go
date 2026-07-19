package replay

import (
	"os"
	"strings"
	"testing"
)

func TestDockerIsolationRequiresImmutableImages(t *testing.T) {
	isolation := DockerIsolation{BaseImage: "example/base:latest", CandidateImage: "example/candidate:latest", ContainerPort: 8080}
	if err := isolation.Validate(); err == nil {
		t.Fatal("mutable tags must be rejected")
	}
}

func TestContainerArgsEnforceIsolationAndResourceLimits(t *testing.T) {
	digest := strings.Repeat("a", 64)
	isolation := DockerIsolation{BaseImage: "example/base@sha256:" + digest, CandidateImage: "example/candidate@sha256:" + strings.Repeat("b", 64), ContainerPort: 8080, MemoryMB: 512, CPUs: 1, PIDsLimit: 128, FixturePath: "/tmp/fixtures"}
	args := strings.Join(workloadArgs("base", "network", isolation.BaseImage, 8080, isolation, "http://stub:9090", "", true), " ")
	for _, required := range []string{"--read-only", "--cap-drop ALL", "no-new-privileges", "--memory 512m", "--cpus 1", "--pids-limit 128", "readonly", "HYRUM_SIDE_EFFECT_STUB_URL=http://stub:9090"} {
		if !strings.Contains(args, required) {
			t.Fatalf("missing %q in %s", required, args)
		}
	}
}

func TestFixtureDatabaseRequiresImmutableImageAndSeedFile(t *testing.T) {
	digest := strings.Repeat("a", 64)
	seed := t.TempDir() + "/fixture.sql"
	if err := os.WriteFile(seed, []byte("select 1;\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	isolation := DockerIsolation{
		BaseImage: "example/base@sha256:" + digest, CandidateImage: "example/candidate@sha256:" + digest,
		FixtureImage: "postgres@sha256:" + digest, FixturePath: seed, ContainerPort: 8080,
	}
	if err := isolation.Validate(); err != nil {
		t.Fatal(err)
	}
	args := strings.Join(fixtureDatabaseArgs("fixture", "network", isolation), " ")
	for _, required := range []string{"POSTGRES_HOST_AUTH_METHOD=trust", "hyrum_fixture", "docker-entrypoint-initdb.d", "--read-only", "--cap-drop ALL"} {
		if !strings.Contains(args, required) {
			t.Fatalf("missing %q in %s", required, args)
		}
	}
}
