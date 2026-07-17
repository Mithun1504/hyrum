package replay

type Bundle struct {
	ReplayRunID             string `json:"replayRunId"`
	BaseImageDigest         string `json:"baseImageDigest"`
	CandidateImageDigest    string `json:"candidateImageDigest"`
	Token                   string `json:"token"`
	CorpusURL               string `json:"corpusUrl"`
	Nonce                   string `json:"nonce"`
	NonceDigest             string `json:"nonceDigest"`
	ReportUploadPath        string `json:"reportUploadPath"`
	CorpusDigest            string `json:"corpusDigest"`
	FixtureDigest           string `json:"fixtureDigest"`
	MaskDigest              string `json:"maskDigest"`
	RunnerVersion           string `json:"runnerVersion"`
	ExtractorVersion        string `json:"extractorVersion"`
	ReportSigningPrivateKey string `json:"reportSigningPrivateKey"`
}

type Delta struct {
	APIOperationID       string         `json:"api_operation_id"`
	BehaviorDefinitionID string         `json:"behavior_definition_id"`
	ConsumerID           string         `json:"consumer_id"`
	AssertionID          *string        `json:"assertion_id"`
	RequestDigest        string         `json:"request_digest"`
	Kind                 string         `json:"kind"`
	DeltaDigest          string         `json:"delta_digest"`
	BeforeDigest         *string        `json:"before_digest"`
	AfterDigest          *string        `json:"after_digest"`
	NormalizedBefore     map[string]any `json:"normalized_before,omitempty"`
	NormalizedAfter      map[string]any `json:"normalized_after,omitempty"`
	Stability            string         `json:"stability"`
	AgreeingAttempts     int            `json:"agreeing_attempts"`
	TotalAttempts        int            `json:"total_attempts"`
}

type Report struct {
	SchemaVersion        int     `json:"schema_version"`
	ReplayRunID          string  `json:"replay_run_id"`
	CorpusDigest         string  `json:"corpus_digest"`
	BaseImageDigest      string  `json:"base_image_digest"`
	CandidateImageDigest string  `json:"candidate_image_digest"`
	FixtureDigest        string  `json:"fixture_digest"`
	MaskDigest           string  `json:"mask_digest"`
	RunnerVersion        string  `json:"runner_version"`
	NonceDigest          string  `json:"nonce_digest"`
	ExtractorVersion     string  `json:"extractor_version"`
	Attempts             int     `json:"attempts"`
	StartedAt            string  `json:"started_at"`
	CompletedAt          string  `json:"completed_at"`
	Deltas               []Delta `json:"deltas"`
}

type reportEnvelope struct {
	ReportBase64    string `json:"reportBase64"`
	SignatureBase64 string `json:"signatureBase64"`
	Nonce           string `json:"nonce"`
}
