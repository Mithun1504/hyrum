package capture

import "testing"

func TestResolveOperationTemplateUsesConfiguredMostSpecificMatch(t *testing.T) {
	operations, err := parseOperationTemplates([]string{
		"GET /products/{id}", "GET /products/search", "POST /products/{id}",
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		method string
		path   string
		want   string
	}{
		{"GET", "/products/search", "/products/search"},
		{"GET", "/products/prod_01", "/products/{id}"},
		{"POST", "/products/prod_01", "/products/{id}"},
		{"GET", "/unknown/value", ""},
	} {
		got, err := resolveOperationTemplate(operations, test.method, test.path)
		if err != nil {
			t.Fatal(err)
		}
		if got != test.want {
			t.Fatalf("resolve %s %s: want %q, got %q", test.method, test.path, test.want, got)
		}
	}
}

func TestOperationTemplatesFailClosed(t *testing.T) {
	for _, value := range []string{"GET relative", "GET /users/{bad param}", "GET /users?token=x", "TOO-LONG-METHOD-NAME /users"} {
		if _, err := parseOperationTemplates([]string{value}); err == nil {
			t.Fatalf("unsafe operation template %q was accepted", value)
		}
	}
	operations, err := parseOperationTemplates([]string{"GET /users/{id}", "GET /users/{name}"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := resolveOperationTemplate(operations, "GET", "/users/alice"); err == nil {
		t.Fatal("ambiguous operation templates were accepted")
	}
}
