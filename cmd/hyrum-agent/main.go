// Command hyrum-agent redacts, session-samples, and fingerprints NDJSON API
// exchanges before they leave the customer trust boundary.
package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/hyrum-dev/hyrum/internal/agentclient"
	"github.com/hyrum-dev/hyrum/internal/buildinfo"
	"github.com/hyrum-dev/hyrum/internal/capture"
	"github.com/hyrum-dev/hyrum/internal/extractors"
	"github.com/hyrum-dev/hyrum/internal/redaction"
)

func openInput(path string) (io.ReadCloser, error) {
	if path == "-" {
		return os.Stdin, nil
	}
	return os.Open(path)
}

func openOutput(path string) (io.WriteCloser, error) {
	if path == "-" {
		return os.Stdout, nil
	}
	return os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
}

func secretKey(name string) ([]byte, error) {
	encoded := os.Getenv(name)
	if encoded == "" {
		return nil, fmt.Errorf("%s is required", name)
	}
	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(key) < 32 {
		return nil, fmt.Errorf("%s must be base64 for at least 32 bytes", name)
	}
	return key, nil
}

func optionalSpoolKey() ([]byte, error) {
	encoded := os.Getenv("HYRUM_SPOOL_ENCRYPTION_KEY")
	if encoded == "" {
		return nil, errors.New("HYRUM_SPOOL_ENCRYPTION_KEY is required for hosted upload mode")
	}
	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(key) != 32 {
		return nil, errors.New("HYRUM_SPOOL_ENCRYPTION_KEY must be base64 for exactly 32 bytes")
	}
	return key, nil
}

func run() error {
	version := flag.Bool("version", false, "print version information")
	inputPath := flag.String("input", "-", "NDJSON input path or - for stdin")
	outputPath := flag.String("output", "-", "processed NDJSON output path or - for stdout")
	maximumEvents := flag.Int("max-events", 10_000, "maximum events accepted in one bounded batch")
	sessionWindow := flag.Duration("session-window", 15*time.Minute, "fallback session window")
	sampleRate := flag.Float64("sample-rate", 0.1, "base session sampling probability")
	lowVolumeThreshold := flag.Uint64("low-volume-threshold", 100, "recent request threshold")
	lowVolumeBoost := flag.Float64("low-volume-boost", 3, "low-volume sampling multiplier")
	controlPlaneURL := flag.String("control-plane-url", "", "control-plane base URL; empty writes processed NDJSON")
	batchID := flag.String("batch-id", "", "stable batch id for idempotent hosted upload")
	spoolDirectory := flag.String("spool-dir", ".hyrum-spool", "encrypted retry spool directory")
	spoolMaxBytes := flag.Int64("spool-max-bytes", 256*1024*1024, "maximum encrypted spool bytes")
	requestTimeout := flag.Duration("request-timeout", 30*time.Second, "control-plane request timeout")
	flag.Parse()

	if *version {
		return json.NewEncoder(os.Stdout).Encode(buildinfo.Current("hyrum-agent"))
	}
	if *maximumEvents < 1 || *maximumEvents > 1_000_000 {
		return errors.New("max-events must be between 1 and 1000000")
	}
	var configuration agentclient.Configuration
	var hostedClient agentclient.Client
	var structuralKey, consumerIdentityKey, samplingKey []byte
	var err error
	if strings.TrimSpace(*controlPlaneURL) != "" {
		token := os.Getenv("HYRUM_AGENT_TOKEN")
		if token == "" {
			return errors.New("HYRUM_AGENT_TOKEN is required for hosted upload mode")
		}
		hostedClient = agentclient.Client{
			BaseURL:    *controlPlaneURL,
			Token:      token,
			HTTPClient: &http.Client{Timeout: *requestTimeout},
		}
		ctx, cancel := context.WithTimeout(context.Background(), *requestTimeout)
		defer cancel()
		configuration, err = hostedClient.Configuration(ctx)
		if err != nil {
			return fmt.Errorf("fetch agent configuration: %w", err)
		}
		if configuration.Extractor.SemanticVersion != extractors.Version ||
			configuration.Extractor.SchemaVersion != extractors.FingerprintSchemaVersion {
			return errors.New("hosted extractor configuration does not match this agent binary")
		}
		if structuralKey, err = agentclient.DecodeKey(configuration.Keys.Structural.Material); err != nil {
			return err
		}
		if consumerIdentityKey, err = agentclient.DecodeKey(configuration.Keys.ConsumerIdentity.Material); err != nil {
			return err
		}
		if samplingKey, err = agentclient.DecodeKey(configuration.Keys.Sampling.Material); err != nil {
			return err
		}
		*sessionWindow = time.Duration(configuration.Sampling.SessionWindowSeconds) * time.Second
		*sampleRate = configuration.Sampling.BaseSampleRate
		*lowVolumeThreshold = configuration.Sampling.LowVolumeThreshold
		*lowVolumeBoost = configuration.Sampling.LowVolumeBoost
	} else {
		structuralKey, err = secretKey("HYRUM_STRUCTURAL_HMAC_KEY")
		if err != nil {
			return err
		}
		consumerIdentityKey, err = secretKey("HYRUM_CONSUMER_HMAC_KEY")
		if err != nil {
			return err
		}
		samplingKey, err = secretKey("HYRUM_SAMPLING_HMAC_KEY")
		if err != nil {
			return err
		}
	}
	input, err := openInput(*inputPath)
	if err != nil {
		return fmt.Errorf("open input: %w", err)
	}
	if input != os.Stdin {
		defer input.Close()
	}
	decoder := json.NewDecoder(io.LimitReader(input, 64*1024*1024))
	decoder.UseNumber()
	decoder.DisallowUnknownFields()
	events := make([]capture.RawExchange, 0, min(*maximumEvents, 1024))
	for {
		if len(events) >= *maximumEvents {
			return errors.New("capture batch exceeds max-events")
		}
		var event capture.RawExchange
		if err := decoder.Decode(&event); errors.Is(err, io.EOF) {
			break
		} else if err != nil {
			return fmt.Errorf("decode capture event: %w", err)
		}
		events = append(events, event)
	}
	if len(events) == 0 {
		return errors.New("capture input contains no events")
	}
	processor := capture.Processor{
		StructuralKey:       structuralKey,
		ConsumerIdentityKey: consumerIdentityKey,
		SamplingKey:         samplingKey,
		Sampling: capture.SamplingPolicy{
			SessionWindow:      *sessionWindow,
			BaseRate:           *sampleRate,
			LowVolumeThreshold: *lowVolumeThreshold,
			LowVolumeBoost:     *lowVolumeBoost,
		},
		Redaction: redaction.Policy{},
	}
	sessions, err := processor.Process(events)
	if err != nil {
		return fmt.Errorf("process capture batch: %w", err)
	}
	if strings.TrimSpace(*controlPlaneURL) != "" {
		if *batchID == "" {
			return errors.New("batch-id is required for hosted upload mode")
		}
		spoolKey, keyErr := optionalSpoolKey()
		if keyErr != nil {
			return keyErr
		}
		spool := agentclient.Spool{Directory: *spoolDirectory, Key: spoolKey, MaxBytes: *spoolMaxBytes}
		ctx, cancel := context.WithTimeout(context.Background(), *requestTimeout*6)
		defer cancel()
		files, listErr := spool.Files()
		if listErr != nil {
			return fmt.Errorf("list encrypted spool: %w", listErr)
		}
		for _, path := range files {
			body, readErr := spool.Read(path)
			if readErr != nil {
				return fmt.Errorf("read encrypted spool: %w", readErr)
			}
			if uploadErr := hostedClient.UploadWithRetry(ctx, body, 3); uploadErr != nil {
				break
			}
			if deleteErr := spool.Delete(path); deleteErr != nil {
				return fmt.Errorf("delete delivered spool record: %w", deleteErr)
			}
		}
		body, encodeErr := agentclient.EncodeBatch(agentclient.Batch{
			AgentBatchID:             *batchID,
			SchemaVersion:            extractors.FingerprintSchemaVersion,
			ExtractorReleaseID:       configuration.Extractor.ID,
			RedactionPolicyVersionID: configuration.Redaction.ID,
			SamplingPolicyVersionID:  configuration.Sampling.ID,
			Sessions:                 sessions,
		})
		if encodeErr != nil {
			return encodeErr
		}
		if uploadErr := hostedClient.UploadWithRetry(ctx, body, 4); uploadErr != nil {
			if _, spoolErr := spool.Put(*batchID, body); spoolErr != nil {
				return fmt.Errorf("upload failed (%v) and encrypted spool failed: %w", uploadErr, spoolErr)
			}
			fmt.Fprintln(os.Stderr, "hyrum-agent: control plane unavailable; batch encrypted in bounded spool")
			return nil
		}
		if heartbeatErr := hostedClient.Heartbeat(ctx, extractors.Version, configuration.ConfigRevision, "online", ""); heartbeatErr != nil {
			fmt.Fprintln(os.Stderr, "hyrum-agent: heartbeat failed after successful upload")
		}
		return nil
	}

	output, err := openOutput(*outputPath)
	if err != nil {
		return fmt.Errorf("open output: %w", err)
	}
	if output != os.Stdout {
		defer output.Close()
	}
	encoder := json.NewEncoder(output)
	encoder.SetEscapeHTML(true)
	for _, session := range sessions {
		if err := encoder.Encode(session); err != nil {
			return fmt.Errorf("encode processed session: %w", err)
		}
	}
	return nil
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "hyrum-agent:", err)
		os.Exit(1)
	}
}
