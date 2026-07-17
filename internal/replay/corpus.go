package replay

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

const MaxCorpusItems = 2000

type CorpusHeader struct {
	Format        string `json:"format"`
	SchemaVersion int    `json:"schema_version"`
}

type Request struct {
	Method         string              `json:"method"`
	Path           string              `json:"path"`
	NormalizedPath string              `json:"normalized_path"`
	Headers        map[string][]string `json:"headers,omitempty"`
	Query          map[string]any      `json:"query,omitempty"`
	Body           any                 `json:"body,omitempty"`
}

type CorpusItem struct {
	AssertionID          *string `json:"assertion_id"`
	APIOperationID       string  `json:"api_operation_id"`
	BehaviorDefinitionID string  `json:"behavior_definition_id"`
	BehaviorKind         string  `json:"behavior_kind"`
	ConsumerID           string  `json:"consumer_id"`
	CoverageClass        string  `json:"coverage_class"`
	OperationKey         string  `json:"operation_key"`
	Request              Request `json:"request"`
	RequestDigest        string  `json:"request_digest"`
	RequiresFixture      bool    `json:"requires_fixture"`
}

func DecodeCorpus(reader io.Reader) ([]CorpusItem, error) {
	scanner := bufio.NewScanner(io.LimitReader(reader, 256*1024*1024))
	scanner.Buffer(make([]byte, 64*1024), 8*1024*1024)
	if !scanner.Scan() {
		return nil, errors.New("corpus header is missing")
	}
	var header CorpusHeader
	if err := json.Unmarshal(scanner.Bytes(), &header); err != nil {
		return nil, fmt.Errorf("decode corpus header: %w", err)
	}
	if header.Format != "hyrum-replay-corpus" || header.SchemaVersion != 1 {
		return nil, errors.New("unsupported corpus format")
	}
	items := make([]CorpusItem, 0, 256)
	for scanner.Scan() {
		if len(items) >= MaxCorpusItems {
			return nil, errors.New("corpus exceeds item limit")
		}
		var item CorpusItem
		if err := json.Unmarshal(scanner.Bytes(), &item); err != nil {
			return nil, fmt.Errorf("decode corpus item %d: %w", len(items)+1, err)
		}
		if item.APIOperationID == "" || item.ConsumerID == "" || item.OperationKey == "" ||
			item.BehaviorKind == "" || item.RequestDigest == "" || item.Request.Method == "" ||
			item.Request.Path == "" {
			return nil, fmt.Errorf("corpus item %d is incomplete", len(items)+1)
		}
		items = append(items, item)
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan corpus: %w", err)
	}
	if len(items) == 0 {
		return nil, errors.New("corpus contains no items")
	}
	return items, nil
}
