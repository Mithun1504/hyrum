// Package session validates ordering and derives typed evidence from captured request sequences.
package session

import (
	"errors"
	"fmt"
	"math"
	"sort"
)

type Tier string

const (
	Tier1 Tier = "T1"
	Tier2 Tier = "T2"
	Tier3 Tier = "T3"
)

type Event struct {
	OrganizationID   string
	EventID          string
	SessionID        string
	ConsumerID       string
	Sequence         int64
	Terminal         bool
	RequestMethod    string
	RequestPath      string
	RequestOperation string
	RequestValues    map[string][]string
	ResponseValues   map[string][]string
	Status           int
	ErrorTemplate    string
}

type Sequence struct {
	OrganizationID string
	SessionID      string
	ConsumerID     string
	Complete       bool
	Events         []Event
}

type Evidence struct {
	Tier Tier              `json:"tier"`
	T1   *EchoEvidence     `json:"echo,omitempty"`
	T2   *PatternEvidence  `json:"pattern,omitempty"`
	T3   *ExposureEvidence `json:"exposure,omitempty"`
}

type EchoEvidence struct {
	TokenHash        string   `json:"token_hash"`
	ResponseEventID  string   `json:"response_event_id"`
	RequestEventID   string   `json:"request_event_id"`
	ResponseSequence int64    `json:"response_sequence"`
	RequestSequence  int64    `json:"request_sequence"`
	RequestMethod    string   `json:"request_method"`
	RequestPath      string   `json:"request_path"`
	ResponsePaths    []string `json:"response_paths"`
	RequestPaths     []string `json:"request_paths"`
}

type PatternEvidence struct {
	Status          int      `json:"status"`
	ErrorTemplate   string   `json:"error_template"`
	NextRequest     string   `json:"next_request"`
	Support         int      `json:"support"`
	ConfounderNotes []string `json:"confounder_notes"`
}

type ExposureEvidence struct {
	BehaviorKind string `json:"behavior_kind"`
	BehaviorPath string `json:"behavior_path"`
	Count        int    `json:"count"`
}

func Build(events []Event) ([]Sequence, error) {
	grouped := map[string][]Event{}
	for _, event := range events {
		if event.OrganizationID == "" || event.EventID == "" || event.SessionID == "" || event.ConsumerID == "" ||
			event.RequestMethod == "" || event.RequestPath == "" || event.Sequence < 1 {
			return nil, errors.New("organization, event, session, consumer, request operation, and positive sequence are required")
		}
		key := event.OrganizationID + "\x00" + event.SessionID
		grouped[key] = append(grouped[key], event)
	}
	keys := make([]string, 0, len(grouped))
	for key := range grouped {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	sequences := make([]Sequence, 0, len(keys))
	for _, key := range keys {
		items := grouped[key]
		sort.Slice(items, func(i, j int) bool { return items[i].Sequence < items[j].Sequence })
		first := items[0]
		complete := items[0].Sequence == 1 && items[len(items)-1].Terminal
		for i, item := range items {
			if item.OrganizationID != first.OrganizationID || item.SessionID != first.SessionID || item.ConsumerID != first.ConsumerID {
				return nil, fmt.Errorf("session %q crosses tenant or consumer boundary", first.SessionID)
			}
			if i > 0 && item.Sequence != items[i-1].Sequence+1 {
				complete = false
				if item.Sequence == items[i-1].Sequence {
					return nil, fmt.Errorf("session %q has duplicate sequence %d", first.SessionID, item.Sequence)
				}
			}
			if item.Terminal && i != len(items)-1 {
				return nil, fmt.Errorf("session %q has events after terminal sequence", first.SessionID)
			}
		}
		sequences = append(sequences, Sequence{
			OrganizationID: first.OrganizationID, SessionID: first.SessionID,
			ConsumerID: first.ConsumerID, Complete: complete, Events: items,
		})
	}
	return sequences, nil
}

func Infer(sequences []Sequence) map[string][]Evidence {
	result := make(map[string][]Evidence, len(sequences))
	for _, sequence := range sequences {
		key := sequence.OrganizationID + "\x00" + sequence.SessionID
		result[key] = detectEchoes(sequence)
	}
	for key, patterns := range detectPatterns(sequences) {
		result[key] = append(result[key], patterns...)
	}
	return result
}

func ExposureEvidenceFor(kind, path string, count int) Evidence {
	return Evidence{Tier: Tier3, T3: &ExposureEvidence{BehaviorKind: kind, BehaviorPath: path, Count: count}}
}

func (evidence Evidence) Validate() error {
	switch evidence.Tier {
	case Tier1:
		if evidence.T1 == nil || evidence.T2 != nil || evidence.T3 != nil {
			return errors.New("T1 evidence requires only echo proof")
		}
		echo := evidence.T1
		if echo.TokenHash == "" || echo.ResponseEventID == "" || echo.RequestEventID == "" ||
			echo.ResponseSequence < 1 || echo.RequestSequence <= echo.ResponseSequence ||
			echo.RequestMethod == "" || echo.RequestPath == "" || len(echo.ResponsePaths) == 0 || len(echo.RequestPaths) == 0 {
			return errors.New("T1 echo proof requires distinct events, positive ordered sequences, operation, and paths")
		}
		if echo.ResponseEventID == echo.RequestEventID {
			return errors.New("T1 echo response and request events must differ")
		}
	case Tier2:
		if evidence.T2 == nil || evidence.T1 != nil || evidence.T3 != nil || evidence.T2.Status < 100 ||
			evidence.T2.ErrorTemplate == "" || evidence.T2.NextRequest == "" || evidence.T2.Support < 1 {
			return errors.New("T2 evidence requires only valid pattern proof")
		}
	case Tier3:
		if evidence.T3 == nil || evidence.T1 != nil || evidence.T2 != nil || evidence.T3.BehaviorPath == "" || evidence.T3.Count < 1 {
			return errors.New("T3 evidence requires only valid exposure proof")
		}
		switch evidence.T3.BehaviorKind {
		case "shape", "ordering", "error", "status":
		default:
			return errors.New("T3 evidence has unsupported behavior kind")
		}
	default:
		return errors.New("evidence tier is unsupported")
	}
	return nil
}

func detectEchoes(sequence Sequence) []Evidence {
	if !sequence.Complete {
		return nil
	}
	evidence := []Evidence{}
	for responseIndex, response := range sequence.Events {
		for token, responsePaths := range response.ResponseValues {
			if _, originatedInRequest := response.RequestValues[token]; originatedInRequest {
				continue
			}
			for requestIndex := responseIndex + 1; requestIndex < len(sequence.Events); requestIndex++ {
				request := sequence.Events[requestIndex]
				requestPaths, echoed := request.RequestValues[token]
				if !echoed || request.Sequence <= response.Sequence {
					continue
				}
				evidence = append(evidence, Evidence{Tier: Tier1, T1: &EchoEvidence{
					TokenHash: token, ResponseEventID: response.EventID, RequestEventID: request.EventID,
					ResponseSequence: response.Sequence, RequestSequence: request.Sequence,
					RequestMethod: request.RequestMethod, RequestPath: request.RequestPath,
					ResponsePaths: append([]string(nil), responsePaths...), RequestPaths: append([]string(nil), requestPaths...),
				}})
				break
			}
		}
	}
	sort.Slice(evidence, func(i, j int) bool {
		if evidence[i].T1.ResponseSequence == evidence[j].T1.ResponseSequence {
			return evidence[i].T1.TokenHash < evidence[j].T1.TokenHash
		}
		return evidence[i].T1.ResponseSequence < evidence[j].T1.ResponseSequence
	})
	return evidence
}

func detectPatterns(sequences []Sequence) map[string][]Evidence {
	const (
		minimumPatternSamples = 20
		minimumVariantSupport = 5
		minimumRateGap        = 0.3
		minimumZScore         = 1.96
	)
	type groupKey struct {
		organizationID string
		consumerID     string
		requestMethod  string
		requestPath    string
		status         int
	}
	type sample struct {
		template string
		action   string
		ref      string
	}
	groups := map[groupKey][]sample{}
	for _, sequence := range sequences {
		if !sequence.Complete {
			continue
		}
		seenGroups := map[groupKey]struct{}{}
		for i := 0; i+1 < len(sequence.Events); i++ {
			event := sequence.Events[i]
			if event.Status < 400 || event.ErrorTemplate == "" {
				continue
			}
			key := groupKey{
				organizationID: sequence.OrganizationID,
				consumerID:     sequence.ConsumerID,
				requestMethod:  event.RequestMethod,
				requestPath:    requestOperation(event),
				status:         event.Status,
			}
			if _, seen := seenGroups[key]; seen {
				continue
			}
			seenGroups[key] = struct{}{}
			next := sequence.Events[i+1].RequestMethod + " " + sequence.Events[i+1].RequestPath
			ref := sequence.OrganizationID + "\x00" + sequence.SessionID
			groups[key] = append(groups[key], sample{template: event.ErrorTemplate, action: next, ref: ref})
		}
	}
	result := map[string][]Evidence{}
	keys := make([]groupKey, 0, len(groups))
	for key := range groups {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		left, right := keys[i], keys[j]
		if left.organizationID != right.organizationID {
			return left.organizationID < right.organizationID
		}
		if left.consumerID != right.consumerID {
			return left.consumerID < right.consumerID
		}
		if left.requestMethod != right.requestMethod {
			return left.requestMethod < right.requestMethod
		}
		if left.requestPath != right.requestPath {
			return left.requestPath < right.requestPath
		}
		return left.status < right.status
	})
	for _, key := range keys {
		samples := groups[key]
		if len(samples) < minimumPatternSamples {
			continue
		}
		templateCounts := map[string]int{}
		actionSet := map[string]struct{}{}
		for _, item := range samples {
			templateCounts[item.template]++
			actionSet[item.action] = struct{}{}
		}
		if len(templateCounts) < 2 {
			continue
		}
		templates := make([]string, 0, len(templateCounts))
		for template := range templateCounts {
			templates = append(templates, template)
		}
		sort.Strings(templates)
		actions := make([]string, 0, len(actionSet))
		for action := range actionSet {
			actions = append(actions, action)
		}
		sort.Strings(actions)
		for _, template := range templates {
			exposedTotal := templateCounts[template]
			controlTotal := len(samples) - exposedTotal
			if exposedTotal < minimumVariantSupport || controlTotal < minimumVariantSupport {
				continue
			}
			bestAction := ""
			bestZScore := 0.0
			for _, action := range actions {
				exposedActions, controlActions := 0, 0
				for _, item := range samples {
					if item.action != action {
						continue
					}
					if item.template == template {
						exposedActions++
					} else {
						controlActions++
					}
				}
				exposedRate := float64(exposedActions) / float64(exposedTotal)
				controlRate := float64(controlActions) / float64(controlTotal)
				rateGap := math.Abs(exposedRate - controlRate)
				pooledRate := float64(exposedActions+controlActions) / float64(exposedTotal+controlTotal)
				standardError := math.Sqrt(pooledRate * (1 - pooledRate) * (1/float64(exposedTotal) + 1/float64(controlTotal)))
				if rateGap < minimumRateGap || standardError == 0 {
					continue
				}
				zScore := rateGap / standardError
				if zScore >= minimumZScore && zScore > bestZScore {
					bestAction, bestZScore = action, zScore
				}
			}
			if bestAction == "" {
				continue
			}
			item := Evidence{Tier: Tier2, T2: &PatternEvidence{
				Status: key.status, ErrorTemplate: template, NextRequest: bestAction, Support: exposedTotal,
				ConfounderNotes: []string{"association only; consumer, originating operation, and status are held constant but unobserved client state may explain branching"},
			}}
			refs := make([]string, 0, exposedTotal)
			for _, sample := range samples {
				if sample.template == template {
					refs = append(refs, sample.ref)
				}
			}
			sort.Strings(refs)
			for _, ref := range compactStrings(refs) {
				result[ref] = append(result[ref], item)
			}
		}
	}
	return result
}

func requestOperation(event Event) string {
	if event.RequestOperation != "" {
		return event.RequestOperation
	}
	return event.RequestPath
}

func compactStrings(values []string) []string {
	if len(values) < 2 {
		return values
	}
	out := values[:1]
	for _, value := range values[1:] {
		if value != out[len(out)-1] {
			out = append(out, value)
		}
	}
	return out
}
