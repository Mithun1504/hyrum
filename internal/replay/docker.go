package replay

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var immutableImage = regexp.MustCompile(`^[a-z0-9][a-z0-9._/-]*(?::[a-zA-Z0-9._-]+)?@sha256:[a-f0-9]{64}$`)

func (isolation *DockerIsolation) Validate() error {
	if !immutableImage.MatchString(isolation.BaseImage) || !immutableImage.MatchString(isolation.CandidateImage) {
		return errors.New("base_image and candidate_image must be immutable image@sha256 references")
	}
	if isolation.StubImage != "" && !immutableImage.MatchString(isolation.StubImage) {
		return errors.New("stub_image must be an immutable image@sha256 reference")
	}
	if isolation.FixtureImage != "" && !immutableImage.MatchString(isolation.FixtureImage) {
		return errors.New("fixture_image must be an immutable image@sha256 reference")
	}
	if isolation.ContainerPort < 1 || isolation.ContainerPort > 65535 {
		return errors.New("container_port must be between 1 and 65535")
	}
	if isolation.StubImage != "" && (isolation.StubPort < 1 || isolation.StubPort > 65535) {
		return errors.New("stub_port is required with stub_image")
	}
	if isolation.FixtureImage != "" {
		if isolation.FixturePort == 0 {
			isolation.FixturePort = 5432
		}
		if isolation.FixturePort < 1 || isolation.FixturePort > 65535 {
			return errors.New("fixture_port must be valid with fixture_image")
		}
		if isolation.FixturePath == "" {
			return errors.New("fixture_path is required with fixture_image")
		}
	}
	if isolation.HealthPath == "" {
		isolation.HealthPath = "/health"
	}
	if !strings.HasPrefix(isolation.HealthPath, "/") || strings.HasPrefix(isolation.HealthPath, "//") {
		return errors.New("health_path must be an absolute URL path")
	}
	if isolation.MemoryMB == 0 {
		isolation.MemoryMB = 512
	}
	if isolation.CPUs == 0 {
		isolation.CPUs = 1
	}
	if isolation.PIDsLimit == 0 {
		isolation.PIDsLimit = 256
	}
	if isolation.MemoryMB < 128 || isolation.MemoryMB > 32768 || isolation.CPUs < 0.1 || isolation.CPUs > 32 || isolation.PIDsLimit < 32 || isolation.PIDsLimit > 4096 {
		return errors.New("memory_mb, cpus, or pids_limit is outside the safe range")
	}
	if isolation.FixturePath != "" {
		absolute, err := filepath.Abs(isolation.FixturePath)
		if err != nil {
			return fmt.Errorf("fixture_path: %w", err)
		}
		resolved, err := filepath.EvalSymlinks(absolute)
		if err != nil {
			return fmt.Errorf("fixture_path: %w", err)
		}
		info, err := os.Stat(resolved)
		if err != nil || !info.Mode().IsRegular() {
			return errors.New("fixture_path must be an existing regular file")
		}
		isolation.FixturePath = resolved
	}
	return nil
}

type DockerClient interface {
	Run(context.Context, ...string) (string, error)
}

type ExecDocker struct{}

func (ExecDocker) Run(ctx context.Context, args ...string) (string, error) {
	command := exec.CommandContext(ctx, "docker", args...)
	output, err := command.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("docker %s: %w: %s", args[0], err, strings.TrimSpace(string(output)))
	}
	return strings.TrimSpace(string(output)), nil
}

// StartDockerIsolation starts immutable base/candidate images on an internal network. Workloads
// have no writable root, Linux capabilities, or access beyond an optional side-effect stub.
func StartDockerIsolation(ctx context.Context, config Config, docker DockerClient) (Config, func(), error) {
	if config.Isolation == nil {
		return config, func() {}, nil
	}
	isolation := *config.Isolation
	if err := isolation.Validate(); err != nil {
		return Config{}, func() {}, err
	}
	suffix, err := randomSuffix()
	if err != nil {
		return Config{}, func() {}, err
	}
	network := "hyrum-replay-" + suffix
	baseName := network + "-base"
	candidateName := network + "-candidate"
	stubName := network + "-stub"
	fixtureName := network + "-fixture-db"
	created := []string{}
	cleanup := func() {
		for index := len(created) - 1; index >= 0; index-- {
			_, _ = docker.Run(context.Background(), "rm", "--force", created[index])
		}
		_, _ = docker.Run(context.Background(), "network", "rm", network)
	}
	if _, err := docker.Run(ctx, "network", "create", "--internal", network); err != nil {
		return Config{}, func() {}, err
	}
	failed := true
	defer func() {
		if failed {
			cleanup()
		}
	}()

	if isolation.StubImage != "" {
		if _, err := docker.Run(ctx, workloadArgs(stubName, network, isolation.StubImage, isolation.StubPort, isolation, "", "", false)...); err != nil {
			return Config{}, func() {}, err
		}
		created = append(created, stubName)
	}
	fixtureURL := ""
	if isolation.FixtureImage != "" {
		if _, err := docker.Run(ctx, fixtureDatabaseArgs(fixtureName, network, isolation)...); err != nil {
			return Config{}, func() {}, err
		}
		created = append(created, fixtureName)
		if err := waitFixtureDatabase(ctx, docker, fixtureName); err != nil {
			return Config{}, func() {}, err
		}
		fixtureURL = fmt.Sprintf("postgresql://postgres@%s:%d/hyrum_fixture?sslmode=disable", fixtureName, isolation.FixturePort)
	}
	stubURL := ""
	if isolation.StubImage != "" {
		stubURL = fmt.Sprintf("http://%s:%d", stubName, isolation.StubPort)
	}
	if _, err := docker.Run(ctx, workloadArgs(baseName, network, isolation.BaseImage, isolation.ContainerPort, isolation, stubURL, fixtureURL, true)...); err != nil {
		return Config{}, func() {}, err
	}
	created = append(created, baseName)
	if _, err := docker.Run(ctx, workloadArgs(candidateName, network, isolation.CandidateImage, isolation.ContainerPort, isolation, stubURL, fixtureURL, true)...); err != nil {
		return Config{}, func() {}, err
	}
	created = append(created, candidateName)

	baseURL, err := publishedURL(ctx, docker, baseName, isolation.ContainerPort)
	if err != nil {
		return Config{}, func() {}, err
	}
	candidateURL, err := publishedURL(ctx, docker, candidateName, isolation.ContainerPort)
	if err != nil {
		return Config{}, func() {}, err
	}
	if err := waitReady(ctx, baseURL+isolation.HealthPath, candidateURL+isolation.HealthPath); err != nil {
		return Config{}, func() {}, err
	}
	config.BaseURL = baseURL
	config.CandidateURL = candidateURL
	config.AllowedHosts = []string{"127.0.0.1"}
	config.Isolation = &isolation
	failed = false
	return config, cleanup, nil
}

func workloadArgs(name, network, image string, port int, isolation DockerIsolation, stubURL, fixtureURL string, publish bool) []string {
	args := []string{
		"run", "--detach", "--name", name, "--network", network,
		"--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
		"--memory", fmt.Sprintf("%dm", isolation.MemoryMB), "--cpus", strconv.FormatFloat(isolation.CPUs, 'f', -1, 64),
		"--pids-limit", strconv.Itoa(isolation.PIDsLimit), "--cap-drop", "ALL",
		"--security-opt", "no-new-privileges",
	}
	if publish {
		args = append(args, "--publish", fmt.Sprintf("127.0.0.1::%d", port))
	}
	if isolation.FixturePath != "" && isolation.FixtureImage == "" {
		args = append(args, "--mount", fmt.Sprintf("type=bind,src=%s,dst=/hyrum-fixtures,readonly", isolation.FixturePath))
	}
	if stubURL != "" {
		args = append(args, "--env", "HYRUM_SIDE_EFFECT_STUB_URL="+stubURL)
	}
	if fixtureURL != "" {
		args = append(args, "--env", "HYRUM_FIXTURE_DATABASE_URL="+fixtureURL)
	}
	return append(args, image)
}

func fixtureDatabaseArgs(name, network string, isolation DockerIsolation) []string {
	return []string{
		"run", "--detach", "--name", name, "--network", network,
		"--user", "999:999",
		"--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
		"--tmpfs", "/var/lib/postgresql/data:rw,nosuid,size=512m,uid=999,gid=999,mode=0700",
		"--tmpfs", "/var/run/postgresql:rw,nosuid,size=16m,uid=999,gid=999,mode=0755",
		"--memory", fmt.Sprintf("%dm", isolation.MemoryMB),
		"--cpus", strconv.FormatFloat(isolation.CPUs, 'f', -1, 64),
		"--pids-limit", strconv.Itoa(isolation.PIDsLimit), "--cap-drop", "ALL",
		"--security-opt", "no-new-privileges",
		"--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--env", "POSTGRES_DB=hyrum_fixture",
		"--mount", fmt.Sprintf("type=bind,src=%s,dst=/docker-entrypoint-initdb.d/001-hyrum-fixture.sql,readonly", isolation.FixturePath),
		isolation.FixtureImage,
	}
}

func waitFixtureDatabase(ctx context.Context, docker DockerClient, name string) error {
	for attempt := 0; attempt < 60; attempt++ {
		if _, err := docker.Run(ctx, "exec", name, "pg_isready", "-U", "postgres", "-d", "hyrum_fixture"); err == nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
	return errors.New("isolated fixture database did not become ready")
}

func publishedURL(ctx context.Context, docker DockerClient, name string, port int) (string, error) {
	output, err := docker.Run(ctx, "port", name, fmt.Sprintf("%d/tcp", port))
	if err != nil {
		return "", err
	}
	line := strings.TrimSpace(strings.Split(output, "\n")[0])
	index := strings.LastIndex(line, ":")
	if index < 0 {
		return "", fmt.Errorf("docker returned invalid published port %q", line)
	}
	hostPort, err := strconv.Atoi(line[index+1:])
	if err != nil || hostPort < 1 || hostPort > 65535 {
		return "", fmt.Errorf("docker returned invalid published port %q", line)
	}
	return fmt.Sprintf("http://127.0.0.1:%d", hostPort), nil
}

func waitReady(ctx context.Context, urls ...string) error {
	client := &http.Client{Timeout: 500 * time.Millisecond}
	for attempt := 0; attempt < 60; attempt++ {
		allReady := true
		for _, target := range urls {
			request, _ := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
			response, err := client.Do(request)
			if err != nil || response.StatusCode < 200 || response.StatusCode >= 300 {
				allReady = false
			}
			if response != nil {
				_ = response.Body.Close()
			}
		}
		if allReady {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
	return errors.New("isolated replay workloads did not become healthy")
}

func randomSuffix() (string, error) {
	value := make([]byte, 6)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}
