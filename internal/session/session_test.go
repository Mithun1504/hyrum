package session

import (
	"fmt"
	"testing"
)

func TestCompleteSequenceProducesEchoEvidence(t *testing.T) {
	events := []Event{
		{OrganizationID: "org", EventID: "request-event", SessionID: "s", ConsumerID: "c", Sequence: 2, Terminal: true, RequestMethod: "GET", RequestPath: "/items", RequestValues: map[string][]string{"token": {"$.query.cursor"}}},
		{OrganizationID: "org", EventID: "response-event", SessionID: "s", ConsumerID: "c", Sequence: 1, RequestMethod: "GET", RequestPath: "/items", ResponseValues: map[string][]string{"token": {"$.next_cursor"}}},
	}
	sequences, err := Build(events)
	if err != nil {
		t.Fatal(err)
	}
	if !sequences[0].Complete {
		t.Fatal("expected sequence to be complete")
	}
	evidence := Infer(sequences)["org\x00s"]
	if len(evidence) != 1 || evidence[0].Tier != Tier1 {
		t.Fatalf("unexpected evidence: %#v", evidence)
	}
	if evidence[0].T1.ResponseEventID != "response-event" || evidence[0].T1.RequestEventID != "request-event" ||
		evidence[0].T1.ResponseSequence >= evidence[0].T1.RequestSequence {
		t.Fatalf("echo attribution is wrong: %#v", evidence[0].T1)
	}
	if err := evidence[0].Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestIncompleteSequenceCannotProduceT1(t *testing.T) {
	sequences, err := Build([]Event{{
		OrganizationID: "org", EventID: "event", SessionID: "s", ConsumerID: "c", Sequence: 2, Terminal: true, RequestMethod: "GET", RequestPath: "/items",
		RequestValues: map[string][]string{"token": {"$.cursor"}}, ResponseValues: map[string][]string{"token": {"$.cursor"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range Infer(sequences)["org\x00s"] {
		if item.Tier == Tier1 {
			t.Fatal("incomplete session produced blocking evidence")
		}
	}
}

func TestEchoEvidenceRejectsMalformedAttribution(t *testing.T) {
	malformed := Evidence{Tier: Tier1, T1: &EchoEvidence{
		TokenHash: "token", ResponseEventID: "same", RequestEventID: "same",
		ResponseSequence: 2, RequestSequence: 1, RequestMethod: "GET", RequestPath: "/items",
		ResponsePaths: []string{"$.cursor"}, RequestPaths: []string{"$.cursor"},
	}}
	if err := malformed.Validate(); err == nil {
		t.Fatal("malformed T1 attribution was accepted")
	}
}

func TestT2RequiresSameConsumerOperationAndStatusWithStatisticalSeparation(t *testing.T) {
	sequences := make([]Sequence, 0, 40)
	for i := range 20 {
		sequences = append(sequences,
			patternSequence("org", "consumer", fmt.Sprintf("redeemed-%d", i), "/discounts/{code}", 422, "already redeemed", "/orders"),
			patternSequence("org", "consumer", fmt.Sprintf("invalid-%d", i), "/discounts/{code}", 422, "invalid code", "/search"),
		)
	}

	evidence := Infer(sequences)["org\x00redeemed-0"]
	if len(evidence) != 1 || evidence[0].Tier != Tier2 {
		t.Fatalf("expected one T2 pattern, got %#v", evidence)
	}
	pattern := evidence[0].T2
	if pattern.ErrorTemplate != "already redeemed" || pattern.NextRequest != "GET /orders" || pattern.Support != 20 {
		t.Fatalf("unexpected T2 attribution: %#v", pattern)
	}
	if err := evidence[0].Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestT2NeverCombinesConsumersEndpointsOrganizationsOrStatuses(t *testing.T) {
	tests := map[string][]Sequence{
		"consumer": splitPatternSequences(func(index int, variant bool) (string, string, int) {
			if variant {
				return "consumer-a", "/discounts/{code}", 422
			}
			return "consumer-b", "/discounts/{code}", 422
		}),
		"endpoint": splitPatternSequences(func(index int, variant bool) (string, string, int) {
			if variant {
				return "consumer", "/discounts/{code}", 422
			}
			return "consumer", "/checkout", 422
		}),
		"organization": append(
			splitPatternSequencesForOrganization("org-a", true),
			splitPatternSequencesForOrganization("org-b", false)...,
		),
		"status": splitPatternSequences(func(index int, variant bool) (string, string, int) {
			if variant {
				return "consumer", "/discounts/{code}", 422
			}
			return "consumer", "/discounts/{code}", 409
		}),
	}
	for name, sequences := range tests {
		t.Run(name, func(t *testing.T) {
			assertNoT2(t, Infer(sequences))
		})
	}
}

func TestT2RejectsLowSupportSmallRateGapAndStatusOnlyBranching(t *testing.T) {
	lowSupport := make([]Sequence, 0, 20)
	for i := range 20 {
		template, next := "common", "/orders"
		if i < 4 {
			template, next = "rare", "/search"
		}
		lowSupport = append(lowSupport, patternSequence("org", "consumer", fmt.Sprintf("low-%d", i), "/discounts/{code}", 422, template, next))
	}
	assertNoT2(t, Infer(lowSupport))

	smallGap := make([]Sequence, 0, 40)
	for i := range 20 {
		leftNext, rightNext := "/orders", "/orders"
		if i >= 10 {
			leftNext = "/search"
		}
		if i >= 9 {
			rightNext = "/search"
		}
		smallGap = append(smallGap,
			patternSequence("org", "consumer", fmt.Sprintf("left-%d", i), "/discounts/{code}", 422, "left", leftNext),
			patternSequence("org", "consumer", fmt.Sprintf("right-%d", i), "/discounts/{code}", 422, "right", rightNext),
		)
	}
	assertNoT2(t, Infer(smallGap))

	statusOnly := make([]Sequence, 0, 40)
	for i := range 40 {
		next := "/orders"
		if i%2 == 0 {
			next = "/search"
		}
		statusOnly = append(statusOnly, patternSequence("org", "consumer", fmt.Sprintf("status-%d", i), "/discounts/{code}", 422, "same template", next))
	}
	assertNoT2(t, Infer(statusOnly))
}

func TestT2UsesOnlyCompleteSessionsAndOneSamplePerSession(t *testing.T) {
	incomplete := make([]Sequence, 0, 40)
	for i := range 40 {
		item := patternSequence("org", "consumer", fmt.Sprintf("incomplete-%d", i), "/discounts/{code}", 422, fmt.Sprintf("template-%d", i%2), fmt.Sprintf("/branch-%d", i%2))
		item.Complete = false
		incomplete = append(incomplete, item)
	}
	assertNoT2(t, Infer(incomplete))

	events := make([]Event, 0, 40)
	for range 20 {
		events = append(events,
			Event{RequestMethod: "GET", RequestPath: "/discounts/{code}", Status: 422, ErrorTemplate: "a"},
			Event{RequestMethod: "GET", RequestPath: "/orders"},
		)
	}
	assertNoT2(t, Infer([]Sequence{{
		OrganizationID: "org", SessionID: "repeated", ConsumerID: "consumer", Complete: true, Events: events,
	}}))
}

func TestT2GroupsDynamicPathsByResolvedOperation(t *testing.T) {
	sequences := make([]Sequence, 0, 40)
	for i := range 40 {
		template, next := "template-a", "/orders"
		if i%2 == 1 {
			template, next = "template-b", "/search"
		}
		item := patternSequence("org", "consumer", fmt.Sprintf("dynamic-%d", i), fmt.Sprintf("/token-%d", i), 422, template, next)
		item.Events[0].RequestOperation = "/discounts/{code}"
		sequences = append(sequences, item)
	}
	inferred := Infer(sequences)
	found := false
	for _, evidence := range inferred {
		for _, item := range evidence {
			found = found || item.Tier == Tier2
		}
	}
	if !found {
		t.Fatal("dynamic path samples were fragmented instead of grouped by operation template")
	}
}

func patternSequence(organization, consumer, sessionID, originPath string, status int, template, nextPath string) Sequence {
	return Sequence{
		OrganizationID: organization,
		SessionID:      sessionID,
		ConsumerID:     consumer,
		Complete:       true,
		Events: []Event{
			{RequestMethod: "GET", RequestPath: originPath, Status: status, ErrorTemplate: template},
			{RequestMethod: "GET", RequestPath: nextPath},
		},
	}
}

func splitPatternSequences(scope func(index int, variant bool) (consumer, path string, status int)) []Sequence {
	sequences := make([]Sequence, 0, 40)
	for i := range 20 {
		consumer, path, status := scope(i, true)
		sequences = append(sequences, patternSequence("org", consumer, fmt.Sprintf("a-%d", i), path, status, "template-a", "/orders"))
		consumer, path, status = scope(i, false)
		sequences = append(sequences, patternSequence("org", consumer, fmt.Sprintf("b-%d", i), path, status, "template-b", "/search"))
	}
	return sequences
}

func splitPatternSequencesForOrganization(organization string, variant bool) []Sequence {
	sequences := make([]Sequence, 0, 20)
	for i := range 20 {
		template, next := "template-a", "/orders"
		if !variant {
			template, next = "template-b", "/search"
		}
		sequences = append(sequences, patternSequence(organization, "consumer", fmt.Sprintf("%s-%d", organization, i), "/discounts/{code}", 422, template, next))
	}
	return sequences
}

func assertNoT2(t *testing.T, inferred map[string][]Evidence) {
	t.Helper()
	for ref, evidence := range inferred {
		for _, item := range evidence {
			if item.Tier == Tier2 {
				t.Fatalf("unexpected T2 evidence for %q: %#v", ref, item)
			}
		}
	}
}
