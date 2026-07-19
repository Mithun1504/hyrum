// Package capture owns strict NDJSON ingestion and in-boundary redaction.
package capture

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/hyrum-dev/hyrum/internal/extractors"
	"github.com/hyrum-dev/hyrum/internal/identity"
	"github.com/hyrum-dev/hyrum/internal/redaction"
	"github.com/hyrum-dev/hyrum/internal/session"
)

const (
	Version          = "1.0.0"
	MaxCaptureEvents = 100_000
)

type Request struct {
	Method       string            `json:"method"`
	Path         string            `json:"path"`
	PathTemplate string            `json:"path_template,omitempty"`
	Query        map[string]any    `json:"query,omitempty"`
	Headers      map[string]string `json:"headers,omitempty"`
	Body         any               `json:"body,omitempty"`
}

type Response struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    any               `json:"body,omitempty"`
}

type Event struct {
	OrganizationID  string    `json:"organization_id"`
	EventID         string    `json:"event_id"`
	SessionID       string    `json:"session_id"`
	ConsumerValue   string    `json:"consumer_value"`
	Sequence        int64     `json:"sequence"`
	SessionComplete bool      `json:"session_complete"`
	OccurredAt      time.Time `json:"occurred_at"`
	Request         Request   `json:"request"`
	Response        Response  `json:"response"`
}

type Record struct {
	Version          string                 `json:"version"`
	OrganizationID   string                 `json:"organization_id"`
	EventID          string                 `json:"event_id"`
	SessionID        string                 `json:"session_id"`
	ConsumerID       string                 `json:"consumer_id"`
	Sequence         int64                  `json:"sequence"`
	SessionComplete  bool                   `json:"session_complete"`
	OccurredAt       time.Time              `json:"occurred_at"`
	Request          Request                `json:"request"`
	Response         Response               `json:"response"`
	Fingerprint      extractors.Fingerprint `json:"fingerprint"`
	RedactionVersion string                 `json:"redaction_version"`
	Evidence         []session.Evidence     `json:"evidence,omitempty"`
}

type Config struct {
	OrganizationID     string
	MasterKey          []byte
	SensitivePaths     []string
	MaskPaths          []string
	OperationTemplates []string
}

func DecodeNDJSON(input io.Reader) ([]Event, error) {
	return decodeNDJSON(input, MaxCaptureEvents)
}

func decodeNDJSON(input io.Reader, maxEvents int) ([]Event, error) {
	if maxEvents < 1 {
		return nil, errors.New("capture event limit must be positive")
	}
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, 64*1024), 8*1024*1024)
	events := []Event{}
	line := 0
	for scanner.Scan() {
		line++
		if len(events) >= maxEvents {
			return nil, fmt.Errorf("capture exceeds maximum of %d events", maxEvents)
		}
		data := bytes.TrimSpace(scanner.Bytes())
		if len(data) == 0 {
			return nil, fmt.Errorf("capture line %d: empty lines are not allowed", line)
		}
		var event Event
		decoder := json.NewDecoder(bytes.NewReader(data))
		decoder.DisallowUnknownFields()
		decoder.UseNumber()
		if err := decoder.Decode(&event); err != nil {
			return nil, fmt.Errorf("capture line %d: %w", line, err)
		}
		if err := ensureEOF(decoder); err != nil {
			return nil, fmt.Errorf("capture line %d: %w", line, err)
		}
		if err := event.Validate(); err != nil {
			return nil, fmt.Errorf("capture line %d: %w", line, err)
		}
		events = append(events, event)
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read capture: %w", err)
	}
	if len(events) == 0 {
		return nil, errors.New("capture input is empty")
	}
	return events, nil
}

func (event Event) Validate() error {
	if strings.TrimSpace(event.OrganizationID) == "" || strings.TrimSpace(event.EventID) == "" ||
		strings.TrimSpace(event.SessionID) == "" || strings.TrimSpace(event.ConsumerValue) == "" {
		return errors.New("organization_id, event_id, session_id, and consumer_value are required")
	}
	if !identity.ValidUUID(event.OrganizationID) {
		return errors.New("organization_id must be a UUID")
	}
	if event.Sequence < 1 || event.OccurredAt.IsZero() {
		return errors.New("positive sequence and occurred_at are required")
	}
	if event.Request.Method == "" {
		return errors.New("request method is required")
	}
	if event.Request.PathTemplate != "" {
		return errors.New("request path_template is capture output only")
	}
	if err := redaction.ValidatePath(event.Request.Path); err != nil {
		return err
	}
	if event.Response.Status < 100 || event.Response.Status > 599 {
		return errors.New("response status must be between 100 and 599")
	}
	return nil
}

func Process(events []Event, config Config) ([]Record, error) {
	if config.OrganizationID == "" {
		return nil, errors.New("configured organization_id is required")
	}
	operations, err := parseOperationTemplates(config.OperationTemplates)
	if err != nil {
		return nil, err
	}
	consumerKey, err := redaction.DeriveKey(config.MasterKey, config.OrganizationID, "consumer-id")
	if err != nil {
		return nil, err
	}
	valueKey, err := redaction.DeriveKey(config.MasterKey, config.OrganizationID, "structural-values")
	if err != nil {
		return nil, err
	}
	pathKey, err := redaction.DeriveKey(config.MasterKey, config.OrganizationID, "path-segments")
	if err != nil {
		return nil, err
	}
	eventKey, err := redaction.DeriveKey(config.MasterKey, config.OrganizationID, "event-id")
	if err != nil {
		return nil, err
	}
	sessionKey, err := redaction.DeriveKey(config.MasterKey, config.OrganizationID, "session-id")
	if err != nil {
		return nil, err
	}
	redactionConfig := redaction.Config{SensitivePaths: config.SensitivePaths}
	records := make([]Record, len(events))
	sessionEvents := make([]session.Event, len(events))
	seenEvents := map[string]struct{}{}
	for i, event := range events {
		if err := event.Validate(); err != nil {
			return nil, fmt.Errorf("event %d: %w", i+1, err)
		}
		if event.OrganizationID != config.OrganizationID {
			return nil, fmt.Errorf("event %q organization_id does not match configured tenant", event.EventID)
		}
		if _, exists := seenEvents[event.EventID]; exists {
			return nil, fmt.Errorf("duplicate event_id %q", event.EventID)
		}
		seenEvents[event.EventID] = struct{}{}
		consumerID, err := redaction.StructuralHash(consumerKey, []byte(event.ConsumerValue))
		if err != nil {
			return nil, err
		}
		eventID, err := redaction.StructuralHash(eventKey, []byte(event.EventID))
		if err != nil {
			return nil, err
		}
		sessionID, err := redaction.StructuralHash(sessionKey, []byte(event.SessionID))
		if err != nil {
			return nil, err
		}
		queryResult, err := redaction.Transform(event.Request.Query, valueKey, redactionConfig)
		if err != nil {
			return nil, err
		}
		requestBody := capturableBody(event.Request.Body, event.Request.Headers)
		bodyResult, err := redaction.Transform(requestBody, valueKey, redactionConfig)
		if err != nil {
			return nil, err
		}
		responseBody := capturableBody(event.Response.Body, event.Response.Headers)
		responseResult, err := redaction.Transform(responseBody, valueKey, redactionConfig)
		if err != nil {
			return nil, err
		}
		pathTemplate, err := resolveOperationTemplate(operations, event.Request.Method, event.Request.Path)
		if err != nil {
			return nil, err
		}
		request, err := redactRequest(event.Request, queryResult.Value, bodyResult.Value, pathKey, pathTemplate)
		if err != nil {
			return nil, err
		}
		response := redactResponse(event.Response, responseResult.Value)
		paginated := hasPagination(event.Request.Query)
		fingerprint := extractors.Extract(event.Response.Status, response.Body, extractors.Options{
			Paginated: paginated, MaskPaths: config.MaskPaths,
		})
		records[i] = Record{
			Version: Version, OrganizationID: event.OrganizationID, EventID: eventID,
			SessionID: sessionID, ConsumerID: consumerID, Sequence: event.Sequence,
			SessionComplete: event.SessionComplete, OccurredAt: event.OccurredAt,
			Request: request, Response: response, Fingerprint: fingerprint, RedactionVersion: redaction.Version,
		}
		errorTemplate := ""
		if fingerprint.Error != nil {
			errorTemplate = fingerprint.Error.Template
		}
		sessionEvents[i] = session.Event{
			OrganizationID: event.OrganizationID, EventID: eventID, SessionID: sessionID, ConsumerID: consumerID,
			Sequence: event.Sequence, Terminal: event.SessionComplete, RequestMethod: event.Request.Method,
			RequestPath: request.Path, RequestOperation: operationIdentity(request),
			RequestValues:  mergeTokens(queryResult.Tokens, "$.query", bodyResult.Tokens, "$.body"),
			ResponseValues: responseResult.Tokens,
			Status:         event.Response.Status, ErrorTemplate: errorTemplate,
		}
	}
	sequences, err := session.Build(sessionEvents)
	if err != nil {
		return nil, err
	}
	evidence := session.Infer(sequences)
	presenceSeries := map[string][]*extractors.Fingerprint{}
	orderingSeries := map[string][]*extractors.Fingerprint{}
	for i := range records {
		presenceKey := records[i].OrganizationID + "\x00" + records[i].ConsumerID + "\x00" + records[i].Request.Method + "\x00" + operationIdentity(records[i].Request)
		presenceSeries[presenceKey] = append(presenceSeries[presenceKey], &records[i].Fingerprint)
		if len(records[i].Fingerprint.Ordering) > 0 {
			orderingKey := records[i].OrganizationID + "\x00" + records[i].SessionID + "\x00" + records[i].ConsumerID + "\x00" + records[i].Request.Method + "\x00" + operationIdentity(records[i].Request)
			orderingSeries[orderingKey] = append(orderingSeries[orderingKey], &records[i].Fingerprint)
		}
	}
	for _, fingerprints := range presenceSeries {
		extractors.FinalizePresenceSeries(fingerprints)
	}
	for _, fingerprints := range orderingSeries {
		extractors.FinalizeOrderingSeries(fingerprints)
	}
	for i := range records {
		key := records[i].OrganizationID + "\x00" + records[i].SessionID
		for _, item := range evidence[key] {
			if item.T1 != nil && item.T1.ResponseEventID == records[i].EventID && item.T1.ResponseSequence == records[i].Sequence {
				records[i].Evidence = append(records[i].Evidence, item)
			}
			if item.T2 != nil && records[i].Fingerprint.Error != nil && item.T2.ErrorTemplate == records[i].Fingerprint.Error.Template {
				records[i].Evidence = append(records[i].Evidence, item)
			}
		}
		for _, field := range records[i].Fingerprint.Shape {
			if field.Path != "$" {
				records[i].Evidence = append(records[i].Evidence, session.ExposureEvidenceFor("shape", field.Path, 1))
			}
		}
		if records[i].Fingerprint.Error != nil {
			records[i].Evidence = append(records[i].Evidence, session.ExposureEvidenceFor("error", "$error", 1))
		}
		for _, ordering := range records[i].Fingerprint.Ordering {
			records[i].Evidence = append(records[i].Evidence, session.ExposureEvidenceFor("ordering", ordering.Path, 1))
		}
	}
	return records, nil
}

func operationIdentity(request Request) string {
	if request.PathTemplate != "" {
		return request.PathTemplate
	}
	return request.Path
}

func EncodeNDJSON(output io.Writer, records []Record) error {
	encoder := json.NewEncoder(output)
	encoder.SetEscapeHTML(false)
	for _, record := range records {
		if record.OrganizationID == "" || record.Version != Version || record.RedactionVersion != redaction.Version ||
			record.Fingerprint.Version != extractors.Version {
			return errors.New("record requires supported capture, redaction, and extractor versions")
		}
		for _, evidence := range record.Evidence {
			if err := evidence.Validate(); err != nil {
				return fmt.Errorf("record %q evidence: %w", record.EventID, err)
			}
			if evidence.T1 != nil && (evidence.T1.ResponseEventID != record.EventID || evidence.T1.ResponseSequence != record.Sequence) {
				return fmt.Errorf("record %q T1 proof does not identify its originating response event", record.EventID)
			}
		}
		if err := encoder.Encode(record); err != nil {
			return err
		}
	}
	return nil
}

func redactRequest(request Request, query, body any, pathKey []byte, pathTemplate string) (Request, error) {
	path, err := redaction.Path(request.Path, pathKey)
	if err != nil {
		return Request{}, err
	}
	return Request{
		Method:       request.Method,
		PathTemplate: pathTemplate,
		Query:        asObject(query), Headers: redaction.Headers(request.Headers),
		Body: body,
		Path: path,
	}, nil
}

func mergeTokens(first map[string][]string, firstRoot string, second map[string][]string, secondRoot string) map[string][]string {
	out := make(map[string][]string, len(first)+len(second))
	for token, paths := range first {
		for _, path := range paths {
			out[token] = append(out[token], firstRoot+strings.TrimPrefix(path, "$"))
		}
	}
	for token, paths := range second {
		for _, path := range paths {
			out[token] = append(out[token], secondRoot+strings.TrimPrefix(path, "$"))
		}
	}
	return out
}

func redactResponse(response Response, body any) Response {
	return Response{Status: response.Status, Headers: redaction.Headers(response.Headers), Body: body}
}

func capturableBody(body any, headers map[string]string) any {
	if body == nil {
		return nil
	}
	contentType := ""
	for name, value := range headers {
		if strings.EqualFold(name, "content-type") {
			contentType = strings.ToLower(strings.TrimSpace(strings.SplitN(value, ";", 2)[0]))
			break
		}
	}
	if strings.HasPrefix(contentType, "multipart/") || contentType == "application/octet-stream" ||
		strings.HasPrefix(contentType, "image/") || strings.HasPrefix(contentType, "audio/") ||
		strings.HasPrefix(contentType, "video/") || strings.HasPrefix(contentType, "font/") ||
		contentType == "application/pdf" || contentType == "application/zip" || contentType == "application/gzip" {
		return nil
	}
	if _, binary := body.([]byte); binary {
		return nil
	}
	return body
}

func asObject(value any) map[string]any {
	if value == nil {
		return nil
	}
	object, _ := value.(map[string]any)
	return object
}

func hasPagination(query map[string]any) bool {
	for key := range query {
		switch strings.ToLower(key) {
		case "cursor", "page", "page_token", "next_cursor", "offset":
			return true
		}
	}
	return false
}

func ensureEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("multiple JSON values on one line")
		}
		return err
	}
	return nil
}
