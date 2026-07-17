// Package extractors implements versioned deterministic behavior facts shared
// by capture and replay. It intentionally contains no model calls or timing
// heuristics so the same input always produces byte-identical fingerprints.
package extractors

const (
	Version                  = "1.0.0"
	FingerprintSchemaVersion = 1
)

type Kind string

const (
	KindShape         Kind = "shape"
	KindOrdering      Kind = "ordering"
	KindErrorTemplate Kind = "error_template"
)

type Fingerprint struct {
	OperationKey     string         `json:"operation_key"`
	Kind             Kind           `json:"kind"`
	SchemaVersion    int            `json:"schema_version"`
	Canonical        map[string]any `json:"canonical"`
	Digest           string         `json:"digest"`
	DefaultLabel     string         `json:"default_label"`
	ObservationCount int            `json:"observation_count"`
}

type Exchange struct {
	Sequence        uint64              `json:"sequence"`
	OperationKey    string              `json:"operation_key"`
	RequestMethod   string              `json:"request_method"`
	RequestPath     string              `json:"request_path"`
	RequestHeaders  map[string][]string `json:"request_headers,omitempty"`
	RequestQuery    map[string]any      `json:"request_query,omitempty"`
	RequestBody     any                 `json:"request_body,omitempty"`
	ResponseStatus  int                 `json:"response_status"`
	ResponseHeaders map[string][]string `json:"response_headers,omitempty"`
	ResponseBody    any                 `json:"response_body,omitempty"`
}

type EchoEvidence struct {
	SourceSequence      uint64 `json:"source_sequence"`
	DestinationSequence uint64 `json:"destination_sequence"`
	SourcePath          string `json:"source_path"`
	DestinationPath     string `json:"destination_path"`
	ValueToken          string `json:"value_token"`
	SourceOperationKey  string `json:"source_operation_key"`
	SourceShapeDigest   string `json:"source_shape_digest"`
}

type Result struct {
	SchemaVersion    int            `json:"schema_version"`
	ExtractorVersion string         `json:"extractor_version"`
	Fingerprints     []Fingerprint  `json:"fingerprints"`
	Echoes           []EchoEvidence `json:"echoes"`
}
