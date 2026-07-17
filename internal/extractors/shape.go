package extractors

import (
	"encoding/json"
	"fmt"
	"sort"
)

type shapeNode struct {
	Path string
	Type string
}

func valueType(value any) string {
	switch value.(type) {
	case nil:
		return "null"
	case bool:
		return "boolean"
	case string:
		return "string"
	case json.Number, float32, float64, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return "number"
	case []any:
		return "array"
	case map[string]any:
		return "object"
	default:
		return fmt.Sprintf("unsupported:%T", value)
	}
}

func collectShape(value any, path string, nodes *[]shapeNode, depth int) {
	if depth > 64 {
		*nodes = append(*nodes, shapeNode{Path: path, Type: "depth_limit"})
		return
	}
	*nodes = append(*nodes, shapeNode{Path: path, Type: valueType(value)})
	switch typed := value.(type) {
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			collectShape(typed[key], path+"/"+escapeJSONPointer(key), nodes, depth+1)
		}
	case []any:
		itemTypes := map[string]struct{}{}
		for _, item := range typed {
			itemTypes[valueType(item)] = struct{}{}
		}
		types := make([]string, 0, len(itemTypes))
		for itemType := range itemTypes {
			types = append(types, itemType)
		}
		sort.Strings(types)
		for _, itemType := range types {
			*nodes = append(*nodes, shapeNode{Path: path + "/*", Type: itemType})
		}
		// Object members from every sampled item are preserved so optional fields
		// remain distinguishable when aggregate observation counts are compared.
		for _, item := range typed {
			if _, ok := item.(map[string]any); ok {
				collectShape(item, path+"/*", nodes, depth+1)
			}
		}
	}
}

func escapeJSONPointer(value string) string {
	result := ""
	for _, character := range value {
		switch character {
		case '~':
			result += "~0"
		case '/':
			result += "~1"
		default:
			result += string(character)
		}
	}
	return result
}

func shapeFingerprint(status int, body any) (Fingerprint, error) {
	nodes := make([]shapeNode, 0, 32)
	collectShape(body, "$", &nodes, 0)
	sort.Slice(nodes, func(i, j int) bool {
		if nodes[i].Path == nodes[j].Path {
			return nodes[i].Type < nodes[j].Type
		}
		return nodes[i].Path < nodes[j].Path
	})
	unique := make([]any, 0, len(nodes))
	var previous shapeNode
	for index, node := range nodes {
		if index > 0 && node == previous {
			continue
		}
		unique = append(unique, map[string]any{"path": node.Path, "type": node.Type})
		previous = node
	}
	return fingerprint(
		KindShape,
		map[string]any{"status": status, "nodes": unique},
		"Response shape",
	)
}

// ShapeFingerprint is used by low-level tests and tools without an HTTP
// envelope. Production capture/replay uses ResponseShapeFingerprint so status
// remains part of the observable contract and spec subtraction is sound.
func ShapeFingerprint(body any) (Fingerprint, error) { return shapeFingerprint(0, body) }

func ResponseShapeFingerprint(status int, body any) (Fingerprint, error) {
	return shapeFingerprint(status, body)
}
