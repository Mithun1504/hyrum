package extractors

import (
	"encoding/json"
	"fmt"
	"sort"
)

func comparable(value any) (string, bool) {
	switch typed := value.(type) {
	case string:
		return "s:" + typed, true
	case float64:
		return fmt.Sprintf("n:%024.9f", typed), true
	case int:
		return fmt.Sprintf("n:%024d", typed), true
	case int64:
		return fmt.Sprintf("n:%024d", typed), true
	case json.Number:
		number, err := typed.Float64()
		if err != nil {
			return "", false
		}
		return fmt.Sprintf("n:%024.9f", number), true
	default:
		return "", false
	}
}

func orderingCandidates(value any, path string, result *[]map[string]any, depth int) {
	if depth > 64 {
		return
	}
	switch typed := value.(type) {
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			orderingCandidates(typed[key], path+"/"+escapeJSONPointer(key), result, depth+1)
		}
	case []any:
		if len(typed) >= 2 {
			objects := make([]map[string]any, 0, len(typed))
			for _, item := range typed {
				object, ok := item.(map[string]any)
				if !ok {
					objects = nil
					break
				}
				objects = append(objects, object)
			}
			if len(objects) == len(typed) {
				keys := make([]string, 0, len(objects[0]))
				for key := range objects[0] {
					keys = append(keys, key)
				}
				sort.Strings(keys)
				for _, key := range keys {
					direction := ""
					previous, ok := comparable(objects[0][key])
					if !ok {
						continue
					}
					valid := true
					for _, object := range objects[1:] {
						current, comparableValue := comparable(object[key])
						if !comparableValue || current == previous {
							valid = false
							break
						}
						step := "ascending"
						if current < previous {
							step = "descending"
						}
						if direction != "" && direction != step {
							valid = false
							break
						}
						direction = step
						previous = current
					}
					if valid && direction != "" {
						*result = append(*result, map[string]any{
							"array_path": path,
							"key":        key,
							"direction":  direction,
						})
					}
				}
			}
		}
		for _, item := range typed {
			orderingCandidates(item, path+"/*", result, depth+1)
		}
	}
}

func OrderingFingerprint(body any) (Fingerprint, bool, error) {
	candidates := make([]map[string]any, 0)
	orderingCandidates(body, "$", &candidates, 0)
	if len(candidates) == 0 {
		return Fingerprint{}, false, nil
	}
	sort.Slice(candidates, func(i, j int) bool {
		left := fmt.Sprint(candidates[i]["array_path"], candidates[i]["key"])
		right := fmt.Sprint(candidates[j]["array_path"], candidates[j]["key"])
		return left < right
	})
	values := make([]any, len(candidates))
	for index, candidate := range candidates {
		values[index] = candidate
	}
	fingerprint, err := fingerprint(
		KindOrdering,
		map[string]any{"candidates": values},
		"Stable response ordering",
	)
	return fingerprint, true, err
}
