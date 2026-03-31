package scraper

import "testing"

func TestExtractText(t *testing.T) {
	html := `<html><head><title>Test</title></head>
	<body>
		<nav>Menu</nav>
		<article>
			<h1>Article Title</h1>
			<p>First paragraph with important content.</p>
			<p>Second paragraph with more details.</p>
		</article>
		<footer>Copyright</footer>
	</body></html>`

	text := ExtractText(html)

	if len(text) == 0 {
		t.Fatal("expected non-empty text")
	}
	if !contains(text, "First paragraph") {
		t.Errorf("expected text to contain 'First paragraph', got: %s", text)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
