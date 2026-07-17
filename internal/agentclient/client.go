package agentclient

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/hyrum-dev/hyrum/internal/capture"
)

const maximumResponseBytes = 1 << 20

type Configuration struct {
	AgentID        string `json:"agentId"`
	ConfigRevision int    `json:"configRevision"`
	Extractor      struct {
		ID              string `json:"id"`
		SemanticVersion string `json:"semanticVersion"`
		SchemaVersion   int    `json:"schemaVersion"`
	} `json:"extractor"`
	Redaction struct {
		ID        string `json:"id"`
		Version   int    `json:"version"`
		CELSource string `json:"celSource"`
	} `json:"redaction"`
	Sampling struct {
		ID                     string   `json:"id"`
		Version                int      `json:"version"`
		SessionWindowSeconds   int      `json:"sessionWindowSeconds"`
		BaseSampleRate         float64  `json:"baseSampleRate"`
		LowVolumeThreshold     uint64   `json:"lowVolumeThreshold"`
		LowVolumeBoost         float64  `json:"lowVolumeBoost"`
		CorrelationHeaderNames []string `json:"correlationHeaderNames"`
	} `json:"sampling"`
	Keys struct {
		Structural struct {
			VersionID string `json:"versionId"`
			Material  string `json:"material"`
		} `json:"structural"`
		ConsumerIdentity struct {
			VersionID string `json:"versionId"`
			Material  string `json:"material"`
		} `json:"consumerIdentity"`
		Sampling struct {
			PolicyVersionID string `json:"policyVersionId"`
			Material        string `json:"material"`
		} `json:"sampling"`
	} `json:"keys"`
}

func DecodeKey(value string) ([]byte, error) {
	key, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || len(key) != 32 {
		return nil, errors.New("agent configuration key must be 32-byte base64url")
	}
	return key, nil
}

type Batch struct {
	AgentBatchID             string                     `json:"agentBatchId"`
	SchemaVersion            int                        `json:"schemaVersion"`
	ExtractorReleaseID       string                     `json:"extractorReleaseId"`
	RedactionPolicyVersionID string                     `json:"redactionPolicyVersionId"`
	SamplingPolicyVersionID  string                     `json:"samplingPolicyVersionId"`
	Sessions                 []capture.ProcessedSession `json:"sessions"`
}

type Client struct {
	BaseURL    string
	Token      string
	HTTPClient *http.Client
}

func (client Client) request(ctx context.Context, method, path string, body []byte) (*http.Response, error) {
	base := strings.TrimRight(client.BaseURL, "/")
	if base == "" || client.Token == "" {
		return nil, errors.New("control plane URL and agent token are required")
	}
	request, err := http.NewRequestWithContext(ctx, method, base+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+client.Token)
	request.Header.Set("Accept", "application/json")
	if len(body) > 0 {
		request.Header.Set("Content-Type", "application/json")
		digest := sha256.Sum256(body)
		request.Header.Set("X-Hyrum-Content-SHA256", hex.EncodeToString(digest[:]))
	}
	httpClient := client.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 30 * time.Second}
	}
	return httpClient.Do(request)
}

func decodeResponse(response *http.Response, target any) error {
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, maximumResponseBytes+1))
	if err != nil {
		return err
	}
	if len(data) > maximumResponseBytes {
		return errors.New("control plane response exceeds limit")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("control plane returned HTTP %d", response.StatusCode)
	}
	if target == nil || len(data) == 0 {
		return nil
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}

func (client Client) Configuration(ctx context.Context) (Configuration, error) {
	response, err := client.request(ctx, http.MethodGet, "/v1/agent/configuration", nil)
	if err != nil {
		return Configuration{}, err
	}
	var configuration Configuration
	if err := decodeResponse(response, &configuration); err != nil {
		return Configuration{}, err
	}
	return configuration, nil
}

func (client Client) Heartbeat(ctx context.Context, version string, revision int, status, errorCode string) error {
	body, err := json.Marshal(map[string]any{
		"agentVersion":   version,
		"configRevision": revision,
		"status":         status,
		"errorCode": func() any {
			if errorCode == "" {
				return nil
			}
			return errorCode
		}(),
	})
	if err != nil {
		return err
	}
	response, err := client.request(ctx, http.MethodPost, "/v1/agent/heartbeat", body)
	if err != nil {
		return err
	}
	return decodeResponse(response, &struct {
		Accepted             bool `json:"accepted"`
		ConfigRevision       int  `json:"configRevision"`
		ConfigurationChanged bool `json:"configurationChanged"`
	}{})
}

func EncodeBatch(batch Batch) ([]byte, error) {
	if strings.TrimSpace(batch.AgentBatchID) == "" || len(batch.Sessions) == 0 {
		return nil, errors.New("batch ID and at least one session are required")
	}
	return json.Marshal(batch)
}

func (client Client) UploadEncoded(ctx context.Context, body []byte) error {
	response, err := client.request(ctx, http.MethodPost, "/v1/agent/ingestion-batches", body)
	if err != nil {
		return err
	}
	return decodeResponse(response, &struct {
		BatchID           string `json:"batchId"`
		Duplicate         bool   `json:"duplicate"`
		Status            string `json:"status"`
		SessionCount      int    `json:"sessionCount"`
		AcceptedItemCount int    `json:"acceptedItemCount"`
		RejectedItemCount int    `json:"rejectedItemCount"`
		Rejections        []struct {
			Index  int    `json:"index"`
			Code   string `json:"code"`
			Detail string `json:"detail"`
		} `json:"rejections"`
	}{})
}

func (client Client) UploadWithRetry(ctx context.Context, body []byte, attempts int) error {
	if attempts < 1 || attempts > 10 {
		return errors.New("upload attempts must be between 1 and 10")
	}
	var last error
	for attempt := 0; attempt < attempts; attempt++ {
		if err := client.UploadEncoded(ctx, body); err == nil {
			return nil
		} else {
			last = err
		}
		if attempt+1 < attempts {
			delay := time.Duration(1<<attempt) * 250 * time.Millisecond
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
			}
		}
	}
	return last
}
