// Package identity contains identifiers shared by Go trust boundaries.
package identity

import "regexp"

var uuid = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func ValidUUID(value string) bool { return uuid.MatchString(value) }
