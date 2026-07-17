package extractors

import (
	"fmt"
	"sort"
	"strings"
)

type leaf struct {
	Path  string
	Token string
}

func collectTokens(value any, path string, result *[]leaf, depth int) {
	if depth > 64 {
		return
	}
	switch typed := value.(type) {
	case string:
		if strings.HasPrefix(typed, "hmac-sha256:") && len(typed) == len("hmac-sha256:")+64 {
			*result = append(*result, leaf{Path: path, Token: typed})
		}
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			collectTokens(typed[key], path+"/"+escapeJSONPointer(key), result, depth+1)
		}
	case []any:
		for index, item := range typed {
			collectTokens(item, fmt.Sprintf("%s/%d", path, index), result, depth+1)
		}
	}
}

func Echoes(exchanges []Exchange) []EchoEvidence {
	result := make([]EchoEvidence, 0)
	for sourceIndex, source := range exchanges {
		shape, shapeErr := ResponseShapeFingerprint(source.ResponseStatus, source.ResponseBody)
		if shapeErr != nil {
			continue
		}
		responseTokens := make([]leaf, 0)
		collectTokens(source.ResponseBody, "$response", &responseTokens, 0)
		if len(responseTokens) == 0 {
			continue
		}
		for _, destination := range exchanges[sourceIndex+1:] {
			requestTokens := make([]leaf, 0)
			collectTokens(destination.RequestQuery, "$request/query", &requestTokens, 0)
			collectTokens(destination.RequestBody, "$request/body", &requestTokens, 0)
			for _, responseToken := range responseTokens {
				for _, requestToken := range requestTokens {
					if responseToken.Token == requestToken.Token {
						result = append(result, EchoEvidence{
							SourceSequence:      source.Sequence,
							DestinationSequence: destination.Sequence,
							SourcePath:          responseToken.Path,
							DestinationPath:     requestToken.Path,
							ValueToken:          responseToken.Token,
							SourceOperationKey:  source.OperationKey,
							SourceShapeDigest:   shape.Digest,
						})
					}
				}
			}
		}
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].SourceSequence != result[j].SourceSequence {
			return result[i].SourceSequence < result[j].SourceSequence
		}
		if result[i].DestinationSequence != result[j].DestinationSequence {
			return result[i].DestinationSequence < result[j].DestinationSequence
		}
		if result[i].SourcePath != result[j].SourcePath {
			return result[i].SourcePath < result[j].SourcePath
		}
		return result[i].DestinationPath < result[j].DestinationPath
	})
	return result
}

func Extract(exchanges []Exchange) (Result, error) {
	fingerprints := make([]Fingerprint, 0, len(exchanges)*2)
	seen := map[string]int{}
	for _, exchange := range exchanges {
		shape, err := ResponseShapeFingerprint(exchange.ResponseStatus, exchange.ResponseBody)
		if err != nil {
			return Result{}, err
		}
		shape.OperationKey = exchange.OperationKey
		shape.ObservationCount = 1
		key := exchange.OperationKey + ":" + string(shape.Kind) + ":" + shape.Digest
		if index, exists := seen[key]; !exists {
			fingerprints = append(fingerprints, shape)
			seen[key] = len(fingerprints) - 1
		} else {
			fingerprints[index].ObservationCount++
		}
		if exchange.ResponseStatus >= 400 {
			errorTemplate, templateError := ErrorTemplateFingerprint(
				exchange.ResponseStatus,
				exchange.ResponseBody,
			)
			if templateError != nil {
				return Result{}, templateError
			}
			errorTemplate.OperationKey = exchange.OperationKey
			errorTemplate.ObservationCount = 1
			key = exchange.OperationKey + ":" + string(errorTemplate.Kind) + ":" + errorTemplate.Digest
			if index, exists := seen[key]; !exists {
				fingerprints = append(fingerprints, errorTemplate)
				seen[key] = len(fingerprints) - 1
			} else {
				fingerprints[index].ObservationCount++
			}
		}
		ordering, found, err := OrderingFingerprint(exchange.ResponseBody)
		if err != nil {
			return Result{}, err
		}
		if found {
			ordering.OperationKey = exchange.OperationKey
			ordering.ObservationCount = 1
			key = exchange.OperationKey + ":" + string(ordering.Kind) + ":" + ordering.Digest
			if index, exists := seen[key]; !exists {
				fingerprints = append(fingerprints, ordering)
				seen[key] = len(fingerprints) - 1
			} else {
				fingerprints[index].ObservationCount++
			}
		}
	}
	sort.Slice(fingerprints, func(i, j int) bool {
		if fingerprints[i].OperationKey != fingerprints[j].OperationKey {
			return fingerprints[i].OperationKey < fingerprints[j].OperationKey
		}
		if fingerprints[i].Kind == fingerprints[j].Kind {
			return fingerprints[i].Digest < fingerprints[j].Digest
		}
		return fingerprints[i].Kind < fingerprints[j].Kind
	})
	return Result{
		SchemaVersion:    FingerprintSchemaVersion,
		ExtractorVersion: Version,
		Fingerprints:     fingerprints,
		Echoes:           Echoes(exchanges),
	}, nil
}
