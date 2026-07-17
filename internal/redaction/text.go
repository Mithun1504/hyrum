package redaction

import (
	"net/url"
	"regexp"
	"strings"
)

var textScrubbers = []struct {
	pattern     *regexp.Regexp
	replacement string
}{
	{regexp.MustCompile(`(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b`), "{email}"},
	{regexp.MustCompile(`(?i)\bbearer\s*:?\s+[A-Z0-9._~+/=-]+`), "Bearer {token}"},
	{regexp.MustCompile(`\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b`), "{token}"},
	{regexp.MustCompile(`(?i)\b(?:sk|pk|rk|ghp|github_pat|xox[baprs])[-_][A-Z0-9_-]{8,}\b`), "{token}"},
	{regexp.MustCompile(`(?i)\b(access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|credential|password|passwd|signature|secret|token)\s*[:=]\s*[A-Z0-9._~+/=-]{6,}`), "$1={token}"},
	{regexp.MustCompile(`(?i)\b[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\b`), "{identifier}"},
	{regexp.MustCompile(`(?i)\b[0-9A-F]{32,}\b`), "{token}"},
	{regexp.MustCompile(`\b(?:\d[ -]?){12,18}\d\b`), "{card}"},
	{regexp.MustCompile(`(?i)(^|[^{A-Z0-9_])(?:cus|cust|customer)_[A-Z0-9_-]+\b`), "$1{customer_id}"},
	{regexp.MustCompile(`(?i)\bcustomer(?:_id|\s+id|id)\s*[:=]?\s*[A-Z0-9_-]+\b`), "customer_id={customer_id}"},
}

var embeddedURL = regexp.MustCompile(`(?i)https?://[^\s"'<>]+`)

// ScrubText removes common PII and credential forms while retaining stable template structure.
func ScrubText(value string) string {
	scrubbed := embeddedURL.ReplaceAllStringFunc(value, scrubURL)
	for _, rule := range textScrubbers {
		scrubbed = rule.pattern.ReplaceAllString(scrubbed, rule.replacement)
	}
	return scrubbed
}

func scrubURL(raw string) string {
	trimmed := strings.TrimRight(raw, ".,;:!?)]")
	suffix := raw[len(trimmed):]
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Host == "" {
		return "{url}" + suffix
	}
	result := parsed.Scheme + "://" + parsed.Host + parsed.Path
	if parsed.RawQuery != "" {
		result += "?{query}"
	}
	if parsed.Fragment != "" {
		result += "#{fragment}"
	}
	return result + suffix
}
