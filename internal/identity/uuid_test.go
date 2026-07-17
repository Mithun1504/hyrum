package identity

import "testing"

func TestValidUUID(t *testing.T) {
	if !ValidUUID("00000000-0000-4000-8000-000000000001") || ValidUUID("org-1") {
		t.Fatal("UUID validation accepted the wrong identifier shape")
	}
}
