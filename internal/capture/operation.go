package capture

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/hyrum-dev/hyrum/internal/redaction"
)

var (
	methodName        = regexp.MustCompile(`^[A-Z]{1,16}$`)
	templateLiteral   = regexp.MustCompile(`^[A-Za-z0-9._~-]{1,128}$`)
	templateParameter = regexp.MustCompile(`^\{[A-Za-z][A-Za-z0-9._-]{0,63}\}$`)
)

type configuredOperation struct {
	method       string
	pathTemplate string
	segments     []string
	literals     int
}

func parseOperationTemplates(values []string) ([]configuredOperation, error) {
	operations := make([]configuredOperation, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		parts := strings.Fields(value)
		if len(parts) != 2 {
			return nil, fmt.Errorf("operation template %q must be METHOD /path", value)
		}
		method := strings.ToUpper(parts[0])
		if !methodName.MatchString(method) {
			return nil, fmt.Errorf("operation template %q has an invalid method", value)
		}
		if !strings.HasPrefix(parts[1], "/") || strings.ContainsAny(parts[1], "?#") {
			return nil, fmt.Errorf("operation template %q must use an absolute path without query or fragment data", value)
		}
		pathTemplate := normalizeTemplatePath(parts[1])
		segments := strings.Split(strings.TrimPrefix(pathTemplate, "/"), "/")
		if pathTemplate == "/" {
			segments = nil
		}
		if len(segments) > redaction.MaxDepth {
			return nil, fmt.Errorf("operation template %q exceeds maximum segment depth", value)
		}
		literals := 0
		for _, segment := range segments {
			switch {
			case templateParameter.MatchString(segment):
			case templateLiteral.MatchString(segment):
				literals++
			default:
				return nil, fmt.Errorf("operation template %q has an unsafe segment", value)
			}
		}
		key := method + " " + pathTemplate
		if _, duplicate := seen[key]; duplicate {
			continue
		}
		seen[key] = struct{}{}
		operations = append(operations, configuredOperation{
			method: method, pathTemplate: pathTemplate, segments: segments, literals: literals,
		})
	}
	sort.Slice(operations, func(i, j int) bool {
		if operations[i].method == operations[j].method {
			return operations[i].pathTemplate < operations[j].pathTemplate
		}
		return operations[i].method < operations[j].method
	})
	return operations, nil
}

func resolveOperationTemplate(operations []configuredOperation, method, rawPath string) (string, error) {
	segments, err := redaction.PathSegments(rawPath)
	if err != nil {
		return "", err
	}
	segments = trimPathSegments(segments[1:])
	best := ""
	bestLiterals := -1
	for _, operation := range operations {
		if operation.method != strings.ToUpper(method) || len(operation.segments) != len(segments) {
			continue
		}
		matched := true
		for index, configured := range operation.segments {
			if templateParameter.MatchString(configured) {
				matched = segments[index] != ""
			} else {
				matched = configured == segments[index]
			}
			if !matched {
				break
			}
		}
		if !matched || operation.literals < bestLiterals {
			continue
		}
		if operation.literals == bestLiterals && best != "" && best != operation.pathTemplate {
			return "", errors.New("request path matches ambiguous operation templates")
		}
		best = operation.pathTemplate
		bestLiterals = operation.literals
	}
	return best, nil
}

func normalizeTemplatePath(path string) string {
	if len(path) > 1 {
		path = strings.TrimSuffix(path, "/")
	}
	return path
}

func trimPathSegments(segments []string) []string {
	if len(segments) > 0 && segments[len(segments)-1] == "" {
		return segments[:len(segments)-1]
	}
	return segments
}
