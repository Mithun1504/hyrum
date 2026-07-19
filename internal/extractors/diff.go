package extractors

import (
	"encoding/json"
	"sort"
)

type Delta struct {
	Kind   string `json:"kind"`
	Path   string `json:"path"`
	Before any    `json:"before,omitempty"`
	After  any    `json:"after,omitempty"`
	Digest string `json:"digest"`
}

func Diff(before, after Fingerprint) []Delta {
	deltas := []Delta{}
	if before.Status != after.Status {
		deltas = append(deltas, makeDelta("status", "$status", before.Status, after.Status))
	}
	compareSet("shape", before.Shape, after.Shape, shapeKey, &deltas)
	compareSet("shape", before.Presence, after.Presence, presenceKey, &deltas)
	compareSet("ordering", before.Ordering, after.Ordering, orderingKey, &deltas)
	if !equal(before.Error, after.Error) {
		path := "$error"
		deltas = append(deltas, makeDelta("error", path, before.Error, after.Error))
	}
	sort.Slice(deltas, func(i, j int) bool {
		if deltas[i].Kind == deltas[j].Kind {
			return deltas[i].Path < deltas[j].Path
		}
		return deltas[i].Kind < deltas[j].Kind
	})
	return deltas
}

func compareSet[T any](kind string, before, after []T, key func(T) string, deltas *[]Delta) {
	left := map[string]T{}
	right := map[string]T{}
	for _, item := range before {
		left[key(item)] = item
	}
	for _, item := range after {
		right[key(item)] = item
	}
	keys := map[string]struct{}{}
	for itemKey := range left {
		keys[itemKey] = struct{}{}
	}
	for itemKey := range right {
		keys[itemKey] = struct{}{}
	}
	for itemKey := range keys {
		leftValue, leftOK := left[itemKey]
		rightValue, rightOK := right[itemKey]
		if !leftOK || !rightOK || !equal(leftValue, rightValue) {
			var beforeValue, afterValue any
			if leftOK {
				beforeValue = leftValue
			}
			if rightOK {
				afterValue = rightValue
			}
			*deltas = append(*deltas, makeDelta(kind, itemKey, beforeValue, afterValue))
		}
	}
}

func makeDelta(kind, path string, before, after any) Delta {
	canonical, _ := CanonicalJSON([]any{kind, path, before, after})
	return Delta{Kind: kind, Path: path, Before: before, After: after, Digest: Digest(canonical)}
}

func shapeKey(field ShapeField) string                { return field.Path }
func presenceKey(pattern PresencePattern) string      { return pattern.Path + "#presence" }
func orderingKey(ordering OrderingFingerprint) string { return ordering.Path }

func equal(left, right any) bool {
	leftJSON, _ := json.Marshal(left)
	rightJSON, _ := json.Marshal(right)
	return string(leftJSON) == string(rightJSON)
}
