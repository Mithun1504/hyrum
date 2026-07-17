package replay

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os/exec"
	"strings"
	"time"
)

type Targets struct {
	BaseURL      string
	CandidateURL string
	cleanup      func()
}

func docker(ctx context.Context, arguments ...string) (string, error) {
	output, err := exec.CommandContext(ctx, "docker", arguments...).CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("docker %s: %w: %s", arguments[0], err, strings.TrimSpace(string(output)))
	}
	return strings.TrimSpace(string(output)), nil
}

func publishedURL(ctx context.Context, name string, port int) (string, error) {
	output, err := docker(ctx, "port", name, fmt.Sprintf("%d/tcp", port))
	if err != nil {
		return "", err
	}
	line := strings.Split(output, "\n")[0]
	_, mapped, found := strings.Cut(line, ":")
	if !found || mapped == "" {
		return "", errors.New("docker did not publish the replay target port")
	}
	return "http://127.0.0.1:" + mapped, nil
}

func waitForPort(ctx context.Context, target string) error {
	address := strings.TrimPrefix(target, "http://")
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		connection, err := net.DialTimeout("tcp", address, 300*time.Millisecond)
		if err == nil {
			connection.Close()
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
	return errors.New("replay target did not become ready")
}

func StartDockerTargets(ctx context.Context, bundle Bundle, targetPort int) (Targets, error) {
	if targetPort < 1 || targetPort > 65535 {
		return Targets{}, errors.New("target port is invalid")
	}
	suffix := strings.ReplaceAll(bundle.ReplayRunID, "-", "")
	if len(suffix) < 12 {
		return Targets{}, errors.New("replay run ID is invalid")
	}
	suffix = suffix[:12]
	network := "hyrum-replay-" + suffix
	baseName, candidateName := network+"-base", network+"-candidate"
	cleanup := func() {
		cleanupContext, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_, _ = docker(cleanupContext, "rm", "-f", baseName, candidateName)
		_, _ = docker(cleanupContext, "network", "rm", network)
	}
	if _, err := docker(ctx, "network", "create", "--internal", network); err != nil {
		return Targets{}, err
	}
	failure := true
	defer func() {
		if failure {
			cleanup()
		}
	}()
	launch := func(name, image string) error {
		_, err := docker(ctx, "run", "-d", "--name", name, "--network", network,
			"--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--cap-drop", "ALL",
			"--security-opt", "no-new-privileges", "--memory", "512m", "--cpus", "1",
			"--pids-limit", "128", "-e", fmt.Sprintf("PORT=%d", targetPort),
			"-p", fmt.Sprintf("127.0.0.1::%d/tcp", targetPort), image)
		return err
	}
	if err := launch(baseName, bundle.BaseImageDigest); err != nil {
		return Targets{}, err
	}
	if err := launch(candidateName, bundle.CandidateImageDigest); err != nil {
		return Targets{}, err
	}
	baseURL, err := publishedURL(ctx, baseName, targetPort)
	if err != nil {
		return Targets{}, err
	}
	candidateURL, err := publishedURL(ctx, candidateName, targetPort)
	if err != nil {
		return Targets{}, err
	}
	if err := waitForPort(ctx, baseURL); err != nil {
		return Targets{}, err
	}
	if err := waitForPort(ctx, candidateURL); err != nil {
		return Targets{}, err
	}
	failure = false
	return Targets{BaseURL: baseURL, CandidateURL: candidateURL, cleanup: cleanup}, nil
}

func (targets Targets) Close() {
	if targets.cleanup != nil {
		targets.cleanup()
	}
}
