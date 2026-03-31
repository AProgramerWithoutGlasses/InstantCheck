package scraper

import (
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var (
	tagRegex      = regexp.MustCompile(`<[^>]*>`)
	spaceRegex    = regexp.MustCompile(`\s+`)
	scriptTagRegex = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	styleTagRegex  = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	navTagRegex    = regexp.MustCompile(`(?is)<nav[^>]*>.*?</nav>`)
	footerTagRegex = regexp.MustCompile(`(?is)<footer[^>]*>.*?</footer>`)
	headerTagRegex = regexp.MustCompile(`(?is)<header[^>]*>.*?</header>`)
)

// FetchURL fetches a URL and returns the extracted text content.
func FetchURL(url string) (string, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return "", fmt.Errorf("failed to fetch URL: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("URL returned status %d", resp.StatusCode)
	}

	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "text/html") && !strings.Contains(ct, "text/plain") {
		return "", fmt.Errorf("unsupported content type: %s", ct)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 5*1024*1024))
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	return ExtractText(string(body)), nil
}

// ExtractText strips HTML tags and extracts readable text.
func ExtractText(html string) string {
	// Remove script, style, nav, footer, header blocks
	text := scriptTagRegex.ReplaceAllString(html, "")
	text = styleTagRegex.ReplaceAllString(text, "")
	text = navTagRegex.ReplaceAllString(text, "")
	text = footerTagRegex.ReplaceAllString(text, "")
	text = headerTagRegex.ReplaceAllString(text, "")
	// Remove remaining tags
	text = tagRegex.ReplaceAllString(text, " ")
	// Normalize whitespace
	text = spaceRegex.ReplaceAllString(text, " ")
	return strings.TrimSpace(text)
}
