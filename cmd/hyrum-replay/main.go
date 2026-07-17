// Command hyrum-replay exposes the exact deterministic extractor used by the
// capture agent. Container execution and base/candidate orchestration build on
// this byte-stable contract.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/hyrum-dev/hyrum/internal/buildinfo"
	"github.com/hyrum-dev/hyrum/internal/extractors"
	"github.com/hyrum-dev/hyrum/internal/replay"
)

func run() error {
	version := flag.Bool("version", false, "print version information")
	maximumEvents := flag.Int("max-events", 100_000, "maximum exchanges accepted from stdin")
	bundlePath := flag.String("bundle", "", "path to the one-use runner bundle")
	baseURL := flag.String("base-url", "", "base build HTTP endpoint")
	candidateURL := flag.String("candidate-url", "", "candidate build HTTP endpoint")
	controlPlaneURL := flag.String("control-plane-url", "", "control-plane base URL for signed report upload")
	targetPort := flag.Int("target-port", 8080, "container HTTP port")
	attempts := flag.Int("attempts", 2, "repeated differential attempts")
	timeout := flag.Duration("request-timeout", 10*time.Second, "per-request timeout")
	allowFixtureWrites := flag.Bool("allow-fixture-writes", false, "allow fixture-marked write requests")
	flag.Parse()
	if *version {
		return json.NewEncoder(os.Stdout).Encode(buildinfo.Current("hyrum-replay"))
	}
	if *bundlePath != "" {
		if *controlPlaneURL == "" {
			return errors.New("control-plane-url is required with a runner bundle")
		}
		bundle, err := replay.LoadBundle(*bundlePath)
		if err != nil {
			return err
		}
		targets := replay.Targets{BaseURL: *baseURL, CandidateURL: *candidateURL}
		if (*baseURL == "") != (*candidateURL == "") {
			return errors.New("base-url and candidate-url must be provided together")
		}
		if targets.BaseURL == "" {
			if *allowFixtureWrites {
				return errors.New("fixture writes require externally managed targets with an isolated fixture adapter")
			}
			targets, err = replay.StartDockerTargets(context.Background(), bundle, *targetPort)
			if err != nil {
				return err
			}
			defer targets.Close()
		}
		client := &http.Client{Timeout: *timeout}
		items, err := replay.DownloadCorpus(context.Background(), client, bundle)
		if err != nil {
			return err
		}
		report, err := replay.Run(context.Background(), items, replay.Options{
			ReplayRunID: bundle.ReplayRunID, CorpusDigest: bundle.CorpusDigest,
			BaseImageDigest: bundle.BaseImageDigest, CandidateImageDigest: bundle.CandidateImageDigest,
			FixtureDigest: bundle.FixtureDigest, MaskDigest: bundle.MaskDigest,
			RunnerVersion: bundle.RunnerVersion, Nonce: bundle.Nonce,
			BaseURL: targets.BaseURL, CandidateURL: targets.CandidateURL, Attempts: *attempts,
			Timeout: *timeout, AllowFixtureWrites: *allowFixtureWrites,
		})
		if err != nil {
			return err
		}
		if err := replay.UploadReport(context.Background(), client, *controlPlaneURL, bundle, report); err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(map[string]any{
			"replayRunId": bundle.ReplayRunID, "status": "succeeded", "deltaCount": len(report.Deltas),
		})
	}
	if *maximumEvents < 1 || *maximumEvents > 1_000_000 {
		return errors.New("max-events must be between 1 and 1000000")
	}
	decoder := json.NewDecoder(io.LimitReader(os.Stdin, 256*1024*1024))
	decoder.UseNumber()
	decoder.DisallowUnknownFields()
	exchanges := make([]extractors.Exchange, 0, min(*maximumEvents, 4096))
	for {
		if len(exchanges) >= *maximumEvents {
			return errors.New("replay extraction input exceeds max-events")
		}
		var exchange extractors.Exchange
		if err := decoder.Decode(&exchange); errors.Is(err, io.EOF) {
			break
		} else if err != nil {
			return fmt.Errorf("decode replay exchange: %w", err)
		}
		exchanges = append(exchanges, exchange)
	}
	if len(exchanges) == 0 {
		return errors.New("replay extraction input contains no exchanges")
	}
	result, err := extractors.Extract(exchanges)
	if err != nil {
		return fmt.Errorf("extract replay behaviors: %w", err)
	}
	return json.NewEncoder(os.Stdout).Encode(result)
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "hyrum-replay:", err)
		os.Exit(1)
	}
}
