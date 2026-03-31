# 秒测 (InstantCheck) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web app where users paste text or a URL, get AI-extracted key points, then take a quiz to test comprehension.

**Architecture:** Go backend (Gin + GORM + MySQL) serves a REST API. React frontend (Vite + Tailwind) consumes it. A single LLM API call generates both summary and quiz. All state is ephemeral — no user accounts.

**Tech Stack:** Go, Gin, GORM, MySQL, React, TypeScript, Vite, Tailwind CSS, Claude API

---

## File Structure

```
instant-check/
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── main.tsx                  # React entry point
│       ├── App.tsx                   # Router setup, 4 routes
│       ├── index.css                 # Tailwind directives
│       ├── types.ts                  # Shared TS types (AnalyzeResponse, etc.)
│       ├── api.ts                    # fetch wrappers for /api/analyze, /api/quiz-result
│       └── pages/
│           ├── InputPage.tsx         # Text/URL input with tab switch
│           ├── SummaryPage.tsx       # Key points grid cards
│           ├── QuizPage.tsx          # Scrollable quiz list
│           └── ResultPage.tsx        # Score + per-question breakdown
├── backend/
│   ├── go.mod
│   ├── go.sum
│   ├── cmd/
│   │   └── server/
│   │       └── main.go              # Gin server bootstrap, route registration
│   └── internal/
│       ├── model/
│       │   └── model.go             # GORM models: AnalyzeLog, QuizResult
│       ├── database/
│       │   └── database.go          # DB connection, auto-migrate
│       ├── llm/
│       │   ├── client.go            # Claude API call, prompt, response parsing
│       │   └── client_test.go       # Test JSON parsing logic
│       ├── scraper/
│       │   ├── scraper.go           # URL fetch + HTML-to-text extraction
│       │   └── scraper_test.go      # Test text extraction from HTML
│       └── handler/
│           ├── analyze.go           # POST /api/analyze handler
│           ├── analyze_test.go      # Integration test with mock LLM
│           ├── quiz_result.go       # POST /api/quiz-result handler
│           └── quiz_result_test.go  # Test quiz result storage
└── README.md
```

---

## Task 1: Backend Project Init

**Files:**
- Create: `backend/go.mod`
- Create: `backend/cmd/server/main.go`

- [ ] **Step 1: Initialize Go module**

```bash
cd "D:/GoLand 2023.3/instant-check/backend"
go mod init github.com/AProgramerWithoutGlasses/instant-check/backend
```

- [ ] **Step 2: Install dependencies**

```bash
cd "D:/GoLand 2023.3/instant-check/backend"
go get github.com/gin-gonic/gin
go get github.com/gin-contrib/cors
go get gorm.io/gorm
go get gorm.io/driver/mysql
```

- [ ] **Step 3: Create minimal main.go**

```go
// backend/cmd/server/main.go
package main

import (
	"log"
	"github.com/gin-gonic/gin"
	"github.com/gin-contrib/cors"
)

func main() {
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173"},
		AllowMethods:     []string{"GET", "POST"},
		AllowHeaders:     []string{"Content-Type"},
	}))

	r.GET("/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "pong"})
	})

	log.Fatal(r.Run(":8080"))
}
```

- [ ] **Step 4: Verify it compiles and runs**

```bash
cd "D:/GoLand 2023.3/instant-check/backend"
go run cmd/server/main.go &
curl http://localhost:8080/ping
# Expected: {"message":"pong"}
```

- [ ] **Step 5: Commit**

```bash
cd "D:/GoLand 2023.3/instant-check"
git add backend/
git commit -m "feat(backend): init Go project with Gin server"
```

---

## Task 2: Database Models + Connection

**Files:**
- Create: `backend/internal/model/model.go`
- Create: `backend/internal/database/database.go`

- [ ] **Step 1: Create GORM models**

```go
// backend/internal/model/model.go
package model

import "time"

type AnalyzeLog struct {
	ID             int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	InputType      string    `gorm:"type:varchar(10);not null" json:"input_type"`
	InputContent   string    `gorm:"type:text;not null" json:"input_content"`
	InputURL       string    `gorm:"type:varchar(2048)" json:"input_url"`
	KeyPointsJSON  string    `gorm:"type:text" json:"key_points_json"`
	QuestionsJSON  string    `gorm:"type:text" json:"questions_json"`
	KeyPointsCount int       `json:"key_points_count"`
	QuestionsCount int       `json:"questions_count"`
	TokenUsage     int       `json:"token_usage"`
	DurationMs     int       `json:"duration_ms"`
	CreatedAt      time.Time `gorm:"autoCreateTime" json:"created_at"`
}

type QuizResult struct {
	ID           int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	AnalyzeID    int64     `gorm:"not null" json:"analyze_id"`
	AnswersJSON  string    `gorm:"type:text;not null" json:"answers_json"`
	CorrectCount int       `gorm:"not null" json:"correct_count"`
	TotalCount   int       `gorm:"not null" json:"total_count"`
	Accuracy     float64   `gorm:"type:decimal(5,2);not null" json:"accuracy"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"created_at"`
}
```

- [ ] **Step 2: Create database connection + auto-migrate**

```go
// backend/internal/database/database.go
package database

import (
	"fmt"
	"os"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"github.com/AProgramerWithoutGlasses/instant-check/backend/internal/model"
)

func Connect() (*gorm.DB, error) {
	user := envOrDefault("DB_USER", "root")
	pass := envOrDefault("DB_PASS", "")
	host := envOrDefault("DB_HOST", "127.0.0.1")
	port := envOrDefault("DB_PORT", "3306")
	name := envOrDefault("DB_NAME", "instantcheck")

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		user, pass, host, port, name)

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("failed to connect database: %w", err)
	}

	if err := db.AutoMigrate(&model.AnalyzeLog{}, &model.QuizResult{}); err != nil {
		return nil, fmt.Errorf("failed to migrate: %w", err)
	}

	return db, nil
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

- [ ] **Step 3: Wire database into main.go**

Update `backend/cmd/server/main.go` — add database connection before starting the server:

```go
package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/gin-contrib/cors"

	"github.com/AProgramerWithoutGlasses/instant-check/backend/internal/database"
)

func main() {
	db, err := database.Connect()
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	_ = db // will be used by handlers later

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins: []string{"http://localhost:5173"},
		AllowMethods: []string{"GET", "POST"},
		AllowHeaders: []string{"Content-Type"},
	}))

	r.GET("/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "pong"})
	})

	log.Fatal(r.Run(":8080"))
}
```

- [ ] **Step 4: Create MySQL database and verify connection**

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS instantcheck CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
cd "D:/GoLand 2023.3/instant-check/backend"
DB_PASS=yourpassword go run cmd/server/main.go
# Expected: server starts without "database connection failed" error
```

- [ ] **Step 5: Commit**

```bash
cd "D:/GoLand 2023.3/instant-check"
git add backend/
git commit -m "feat(backend): add GORM models and database connection"
```

---

## Task 3: URL Scraper

**Files:**
- Create: `backend/internal/scraper/scraper.go`
- Create: `backend/internal/scraper/scraper_test.go`

- [ ] **Step 1: Write test for HTML text extraction**

```go
// backend/internal/scraper/scraper_test.go
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "D:/GoLand 2023.3/instant-check/backend"
go test ./internal/scraper/ -v
# Expected: FAIL — ExtractText not defined
```

- [ ] **Step 3: Implement scraper**

```go
// backend/internal/scraper/scraper.go
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
	tagRegex    = regexp.MustCompile(`<[^>]*>`)
	spaceRegex  = regexp.MustCompile(`\s+`)
	scriptRegex = regexp.MustCompile(`(?is)<(script|style|nav|footer|header)[^>]*>.*?</\1>`)
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

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	return ExtractText(string(body)), nil
}

// ExtractText strips HTML tags and extracts readable text.
func ExtractText(html string) string {
	// Remove script, style, nav, footer, header blocks
	text := scriptRegex.ReplaceAllString(html, "")
	// Remove remaining tags
	text = tagRegex.ReplaceAllString(text, " ")
	// Normalize whitespace
	text = spaceRegex.ReplaceAllString(text, " ")
	return strings.TrimSpace(text)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "D:/GoLand 2023.3/instant-check/backend"
go test ./internal/scraper/ -v
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
cd "D:/GoLand 2023.3/instant-check"
git add backend/internal/scraper/
git commit -m "feat(backend): add URL scraper with HTML text extraction"
```

---

## Task 4: LLM Client

**Files:**
- Create: `backend/internal/llm/client.go`
- Create: `backend/internal/llm/client_test.go`

- [ ] **Step 1: Write test for response JSON parsing**

```go
// backend/internal/llm/client_test.go
package llm

import (
	"encoding/json"
	"testing"
)

func TestParseAnalyzeResponse(t *testing.T) {
	raw := `{
		"key_points": [
			{"title": "Point 1", "description": "Description 1"},
			{"title": "Point 2", "description": "Description 2"}
		],
		"questions": [
			{
				"id": 1,
				"question": "What is point 1?",
				"options": ["A", "B", "C", "D"],
				"correct_answer": 0,
				"explanation": "Because..."
			}
		]
	}`

	var result AnalyzeResult
	err := json.Unmarshal([]byte(raw), &result)
	if err != nil {
		t.Fatalf("failed to parse: %v", err)
	}

	if len(result.KeyPoints) != 2 {
		t.Errorf("expected 2 key points, got %d", len(result.KeyPoints))
	}
	if len(result.Questions) != 1 {
		t.Errorf("expected 1 question, got %d", len(result.Questions))
	}
	if result.Questions[0].CorrectAnswer != 0 {
		t.Errorf("expected correct_answer 0, got %d", result.Questions[0].CorrectAnswer)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "D:/GoLand 2023.3/instant-check/backend"
go test ./internal/llm/ -v
# Expected: FAIL — AnalyzeResult not defined
```

- [ ] **Step 3: Implement LLM client**

```go
// backend/internal/llm/client.go
package llm

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

type KeyPoint struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

type Question struct {
	ID            int      `json:"id"`
	Question      string   `json:"question"`
	Options       []string `json:"options"`
	CorrectAnswer int      `json:"correct_answer"`
	Explanation   string   `json:"explanation"`
}

type AnalyzeResult struct {
	KeyPoints []KeyPoint `json:"key_points"`
	Questions []Question `json:"questions"`
}

type Client struct {
	apiKey     string
	httpClient *http.Client
}

func NewClient() *Client {
	return &Client{
		apiKey:     os.Getenv("ANTHROPIC_API_KEY"),
		httpClient: &http.Client{Timeout: 60 * time.Second},
	}
}

func (c *Client) Analyze(text string) (*AnalyzeResult, int, error) {
	prompt := fmt.Sprintf(`请分析以下文章，完成两个任务：

1. 提取 3-7 个关键知识点，每个包含标题和详细说明
2. 基于关键点生成 5 道四选一选择题，每题包含题目、4 个选项、正确答案索引（0-3）和解析

请严格按以下 JSON 格式返回，不要包含任何其他文字：

{
  "key_points": [
    {"title": "标题", "description": "详细说明"}
  ],
  "questions": [
    {
      "id": 1,
      "question": "题目描述",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "correct_answer": 0,
      "explanation": "答案解析"
    }
  ]
}

文章内容：
%s`, text)

	reqBody := map[string]interface{}{
		"model":      "claude-sonnet-4-20250514",
		"max_tokens": 4096,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	var apiResp struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}

	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, 0, fmt.Errorf("failed to parse API response: %w", err)
	}

	if len(apiResp.Content) == 0 {
		return nil, 0, fmt.Errorf("empty API response")
	}

	var result AnalyzeResult
	if err := json.Unmarshal([]byte(apiResp.Content[0].Text), &result); err != nil {
		return nil, 0, fmt.Errorf("failed to parse LLM JSON output: %w", err)
	}

	tokenUsage := apiResp.Usage.InputTokens + apiResp.Usage.OutputTokens
	return &result, tokenUsage, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "D:/GoLand 2023.3/instant-check/backend"
go test ./internal/llm/ -v
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
cd "D:/GoLand 2023.3/instant-check"
git add backend/internal/llm/
git commit -m "feat(backend): add LLM client with Claude API integration"
```

---

## Task 5: Analyze Handler

**Files:**
- Create: `backend/internal/handler/analyze.go`
- Create: `backend/internal/handler/analyze_test.go`

- [ ] **Step 1: Write test for analyze handler**

```go
// backend/internal/handler/analyze_test.go
package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAnalyzeHandler_EmptyContent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	h := &AnalyzeHandler{}
	r.POST("/api/analyze", h.Handle)

	body := `{"type":"text","content":""}`
	req := httptest.NewRequest("POST", "/api/analyze", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestAnalyzeHandler_InvalidType(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	h := &AnalyzeHandler{}
	r.POST("/api/analyze", h.Handle)

	body := `{"type":"pdf","content":"some text"}`
	req := httptest.NewRequest("POST", "/api/analyze", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}

	var resp map[string]string
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["error"] == "" {
		t.Error("expected error message in response")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "D:/GoLand 2023.3/instant-check/backend"
go test ./internal/handler/ -v
# Expected: FAIL — AnalyzeHandler not defined
```

- [ ] **Step 3: Implement analyze handler**

```go
// backend/internal/handler/analyze.go
package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/AProgramerWithoutGlasses/instant-check/backend/internal/llm"
	"github.com/AProgramerWithoutGlasses/instant-check/backend/internal/model"
	"github.com/AProgramerWithoutGlasses/instant-check/backend/internal/scraper"
)

type AnalyzeHandler struct {
	DB        *gorm.DB
	LLMClient *llm.Client
}

type AnalyzeRequest struct {
	Type    string `json:"type" binding:"required"`
	Content string `json:"content" binding:"required"`
}

type AnalyzeResponse struct {
	ID      int64 `json:"id"`
	Summary struct {
		KeyPoints []llm.KeyPoint `json:"key_points"`
	} `json:"summary"`
	Quiz struct {
		Questions []llm.Question `json:"questions"`
	} `json:"quiz"`
}

func (h *AnalyzeHandler) Handle(c *gin.Context) {
	var req AnalyzeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供输入内容"})
		return
	}

	if req.Type != "text" && req.Type != "url" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type 必须为 text 或 url"})
		return
	}

	text := req.Content
	inputURL := ""

	if req.Type == "url" {
		inputURL = req.Content
		var err error
		text, err = scraper.FetchURL(req.Content)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无法获取该网页内容: " + err.Error()})
			return
		}
		if len([]rune(text)) < 100 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "内容过短，无法生成有效测验"})
			return
		}
	}

	if len([]rune(text)) > 10000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文本内容不能超过10000字符"})
		return
	}

	start := time.Now()
	result, tokenUsage, err := h.LLMClient.Analyze(text)
	duration := time.Since(start).Milliseconds()

	if err != nil {
		// Retry once
		result, tokenUsage, err = h.LLMClient.Analyze(text)
		duration = time.Since(start).Milliseconds()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "分析失败，请重试"})
			return
		}
	}

	keyPointsJSON, _ := json.Marshal(result.KeyPoints)
	questionsJSON, _ := json.Marshal(result.Questions)

	logEntry := model.AnalyzeLog{
		InputType:      req.Type,
		InputContent:   text,
		InputURL:       inputURL,
		KeyPointsJSON:  string(keyPointsJSON),
		QuestionsJSON:  string(questionsJSON),
		KeyPointsCount: len(result.KeyPoints),
		QuestionsCount: len(result.Questions),
		TokenUsage:     tokenUsage,
		DurationMs:     int(duration),
	}

	if h.DB != nil {
		h.DB.Create(&logEntry)
	}

	resp := AnalyzeResponse{ID: logEntry.ID}
	resp.Summary.KeyPoints = result.KeyPoints
	resp.Quiz.Questions = result.Questions

	c.JSON(http.StatusOK, resp)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "D:/GoLand 2023.3/instant-check/backend"
go test ./internal/handler/ -v
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
cd "D:/GoLand 2023.3/instant-check"
git add backend/internal/handler/analyze.go backend/internal/handler/analyze_test.go
git commit -m "feat(backend): add POST /api/analyze handler"
```

---

## Task 6: Quiz Result Handler

**Files:**
- Create: `backend/internal/handler/quiz_result.go`
- Create: `backend/internal/handler/quiz_result_test.go`

- [ ] **Step 1: Write test for quiz result handler**

```go
// backend/internal/handler/quiz_result_test.go
package handler

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestQuizResultHandler_EmptyAnswers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	h := &QuizResultHandler{}
	r.POST("/api/quiz-result", h.Handle)

	body := `{"analyze_id":1,"answers":[]}`
	req := httptest.NewRequest("POST", "/api/quiz-result", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "D:/GoLand 2023.3/instant-check/backend"
go test ./internal/handler/ -v -run TestQuizResult
# Expected: FAIL — QuizResultHandler not defined
```

- [ ] **Step 3: Implement quiz result handler**

```go
// backend/internal/handler/quiz_result.go
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/AProgramerWithoutGlasses/instant-check/backend/internal/model"
)

type QuizResultHandler struct {
	DB *gorm.DB
}

type QuizAnswer struct {
	QuestionID     int `json:"question_id"`
	SelectedAnswer int `json:"selected_answer"`
	CorrectAnswer  int `json:"correct_answer"`
}

type QuizResultRequest struct {
	AnalyzeID int64        `json:"analyze_id" binding:"required"`
	Answers   []QuizAnswer `json:"answers"`
}

func (h *QuizResultHandler) Handle(c *gin.Context) {
	var req QuizResultRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供作答结果"})
		return
	}

	if len(req.Answers) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "答案不能为空"})
		return
	}

	correctCount := 0
	for _, a := range req.Answers {
		if a.SelectedAnswer == a.CorrectAnswer {
			correctCount++
		}
	}

	total := len(req.Answers)
	accuracy := float64(correctCount) / float64(total) * 100

	answersJSON, _ := json.Marshal(req.Answers)

	result := model.QuizResult{
		AnalyzeID:    req.AnalyzeID,
		AnswersJSON:  string(answersJSON),
		CorrectCount: correctCount,
		TotalCount:   total,
		Accuracy:     accuracy,
	}

	if h.DB != nil {
		h.DB.Create(&result)
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "D:/GoLand 2023.3/instant-check/backend"
go test ./internal/handler/ -v
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
cd "D:/GoLand 2023.3/instant-check"
git add backend/internal/handler/quiz_result.go backend/internal/handler/quiz_result_test.go
git commit -m "feat(backend): add POST /api/quiz-result handler"
```

---

## Task 7: Wire Up Server Routes

**Files:**
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Update main.go with all routes**

```go
// backend/cmd/server/main.go
package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/gin-contrib/cors"

	"github.com/AProgramerWithoutGlasses/instant-check/backend/internal/database"
	"github.com/AProgramerWithoutGlasses/instant-check/backend/internal/handler"
	"github.com/AProgramerWithoutGlasses/instant-check/backend/internal/llm"
)

func main() {
	db, err := database.Connect()
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}

	llmClient := llm.NewClient()

	analyzeHandler := &handler.AnalyzeHandler{DB: db, LLMClient: llmClient}
	quizResultHandler := &handler.QuizResultHandler{DB: db}

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins: []string{"http://localhost:5173"},
		AllowMethods: []string{"GET", "POST"},
		AllowHeaders: []string{"Content-Type"},
	}))

	api := r.Group("/api")
	{
		api.POST("/analyze", analyzeHandler.Handle)
		api.POST("/quiz-result", quizResultHandler.Handle)
	}

	log.Println("Server starting on :8080")
	log.Fatal(r.Run(":8080"))
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd "D:/GoLand 2023.3/instant-check/backend"
go build ./cmd/server/
# Expected: no errors
```

- [ ] **Step 3: Commit**

```bash
cd "D:/GoLand 2023.3/instant-check"
git add backend/cmd/server/main.go
git commit -m "feat(backend): wire up all API routes in server"
```

---

## Task 8: Frontend Project Init

**Files:**
- Create: `frontend/` with Vite + React + TypeScript + Tailwind

- [ ] **Step 1: Scaffold React project with Vite**

```bash
cd "D:/GoLand 2023.3/instant-check"
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

- [ ] **Step 2: Install Tailwind CSS**

```bash
cd "D:/GoLand 2023.3/instant-check/frontend"
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Configure Tailwind in vite.config.ts**

```ts
// frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
```

- [ ] **Step 4: Add Tailwind import to CSS**

Replace `frontend/src/index.css` with:

```css
@import "tailwindcss";
```

- [ ] **Step 5: Install React Router**

```bash
cd "D:/GoLand 2023.3/instant-check/frontend"
npm install react-router-dom
```

- [ ] **Step 6: Clean up default files**

Delete `frontend/src/App.css` and replace `frontend/src/App.tsx` with:

```tsx
// frontend/src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <Routes>
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 7: Verify dev server starts**

```bash
cd "D:/GoLand 2023.3/instant-check/frontend"
npm run dev
# Expected: Vite dev server on http://localhost:5173, shows "Home"
```

- [ ] **Step 8: Commit**

```bash
cd "D:/GoLand 2023.3/instant-check"
git add frontend/
git commit -m "feat(frontend): init React + Vite + Tailwind project"
```

---

## Task 9: Frontend Types + API Client

**Files:**
- Create: `frontend/src/types.ts`
- Create: `frontend/src/api.ts`

- [ ] **Step 1: Define TypeScript types**

```ts
// frontend/src/types.ts
export interface KeyPoint {
  title: string
  description: string
}

export interface Question {
  id: number
  question: string
  options: string[]
  correct_answer: number
  explanation: string
}

export interface AnalyzeResponse {
  id: number
  summary: {
    key_points: KeyPoint[]
  }
  quiz: {
    questions: Question[]
  }
}

export interface QuizAnswer {
  question_id: number
  selected_answer: number
  correct_answer: number
}
```

- [ ] **Step 2: Create API client**

```ts
// frontend/src/api.ts
import type { AnalyzeResponse, QuizAnswer } from './types'

export async function analyzeContent(
  type: 'text' | 'url',
  content: string
): Promise<AnalyzeResponse> {
  const resp = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, content }),
  })

  if (!resp.ok) {
    const err = await resp.json()
    throw new Error(err.error || '请求失败')
  }

  return resp.json()
}

export async function submitQuizResult(
  analyzeId: number,
  answers: QuizAnswer[]
): Promise<void> {
  await fetch('/api/quiz-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analyze_id: analyzeId, answers }),
  })
}
```

- [ ] **Step 3: Commit**

```bash
cd "D:/GoLand 2023.3/instant-check"
git add frontend/src/types.ts frontend/src/api.ts
git commit -m "feat(frontend): add TypeScript types and API client"
```

---

## Task 10: InputPage

**Files:**
- Create: `frontend/src/pages/InputPage.tsx`

- [ ] **Step 1: Implement InputPage component**

```tsx
// frontend/src/pages/InputPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeContent } from '../api'
import type { AnalyzeResponse } from '../types'

interface Props {
  onAnalyzed: (data: AnalyzeResponse) => void
}

export default function InputPage({ onAnalyzed }: Props) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'text' | 'url'>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const content = tab === 'text' ? text : url
  const canSubmit = content.trim().length > 0 && !loading

  async function handleSubmit() {
    if (!canSubmit) return
    setError('')
    setLoading(true)

    try {
      const data = await analyzeContent(tab, content.trim())
      onAnalyzed(data)
      navigate('/summary')
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">📖 秒测</h1>
          <p className="text-gray-400 mt-2">
            粘贴文本或输入 URL，AI 帮你抓重点、出考题
          </p>
        </div>

        <div className="bg-gray-900 rounded-xl p-6">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setTab('text')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === 'text'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              📋 粘贴文本
            </button>
            <button
              onClick={() => setTab('url')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === 'url'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              🔗 输入 URL
            </button>
          </div>

          {tab === 'text' ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="在这里粘贴文章内容..."
              maxLength={10000}
              className="w-full h-48 bg-gray-950 border border-gray-700 rounded-lg p-4 text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-purple-500"
            />
          ) : (
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full bg-gray-950 border border-gray-700 rounded-lg p-4 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          )}

          {tab === 'text' && (
            <div className="text-right text-xs text-gray-500 mt-1">
              {text.length} / 10000
            </div>
          )}

          {error && (
            <div className="mt-3 text-sm text-red-400 bg-red-900/20 rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="mt-4 text-right">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition"
            >
              {loading ? '正在分析...' : '开始分析 →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it renders in the browser**

Add temporary route in App.tsx and check http://localhost:5173 shows the input page.

- [ ] **Step 3: Commit**

```bash
cd "D:/GoLand 2023.3/instant-check"
git add frontend/src/pages/InputPage.tsx
git commit -m "feat(frontend): add InputPage with text/URL tab switch"
```

---

## Task 11: SummaryPage

**Files:**
- Create: `frontend/src/pages/SummaryPage.tsx`

- [ ] **Step 1: Implement SummaryPage component**

```tsx
// frontend/src/pages/SummaryPage.tsx
import { useNavigate } from 'react-router-dom'
import type { AnalyzeResponse } from '../types'

interface Props {
  data: AnalyzeResponse | null
}

export default function SummaryPage({ data }: Props) {
  const navigate = useNavigate()

  if (!data) {
    navigate('/')
    return null
  }

  const keyPoints = data.summary.key_points

  return (
    <div className="flex items-center justify-center min-h-screen px-4 py-12">
      <div className="w-full max-w-4xl">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-purple-400">📖 关键点摘要</h2>
          <p className="text-gray-400 mt-1">
            AI 从文章中提取了 {keyPoints.length} 个关键点
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {keyPoints.map((point, i) => (
            <div
              key={i}
              className="bg-gray-900 rounded-xl p-5 border border-gray-800"
            >
              <h3 className="text-purple-400 font-medium text-sm mb-2">
                {point.title}
              </h3>
              <p className="text-gray-300 text-sm leading-relaxed">
                {point.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/quiz')}
            className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition"
          >
            我已了解，开始测验 →
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd "D:/GoLand 2023.3/instant-check"
git add frontend/src/pages/SummaryPage.tsx
git commit -m "feat(frontend): add SummaryPage with key points grid"
```

---

## Task 12: QuizPage

**Files:**
- Create: `frontend/src/pages/QuizPage.tsx`

- [ ] **Step 1: Implement QuizPage component**

```tsx
// frontend/src/pages/QuizPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { submitQuizResult } from '../api'
import type { AnalyzeResponse, QuizAnswer } from '../types'

interface Props {
  data: AnalyzeResponse | null
  onCompleted: (answers: QuizAnswer[]) => void
}

export default function QuizPage({ data, onCompleted }: Props) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Record<number, number>>({})
  const [submitting, setSubmitting] = useState(false)

  if (!data) {
    navigate('/')
    return null
  }

  const questions = data.quiz.questions
  const allAnswered = questions.every((q) => selected[q.id] !== undefined)

  function selectOption(questionId: number, optionIndex: number) {
    setSelected((prev) => ({ ...prev, [questionId]: optionIndex }))
  }

  async function handleSubmit() {
    if (!allAnswered || submitting) return
    setSubmitting(true)

    const answers: QuizAnswer[] = questions.map((q) => ({
      question_id: q.id,
      selected_answer: selected[q.id],
      correct_answer: q.correct_answer,
    }))

    await submitQuizResult(data.id, answers)
    onCompleted(answers)
    navigate('/result')
  }

  const answeredCount = Object.keys(selected).length
  const optionLabels = ['A', 'B', 'C', 'D']

  return (
    <div className="flex justify-center min-h-screen px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white">📝 知识测验</h2>
          <p className="text-gray-400 mt-1">
            共 {questions.length} 题 · 已答 {answeredCount} 题
          </p>
        </div>

        <div className="space-y-6">
          {questions.map((q) => (
            <div
              key={q.id}
              className="bg-gray-900 rounded-xl p-5 border border-gray-800"
            >
              <p className="text-white font-medium mb-4">
                {q.id}. {q.question}
              </p>
              <div className="space-y-2">
                {q.options.map((option, i) => (
                  <button
                    key={i}
                    onClick={() => selectOption(q.id, i)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition text-sm ${
                      selected[q.id] === i
                        ? 'border-purple-500 bg-purple-900/30 text-white'
                        : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {optionLabels[i]}. {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
            className="px-8 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition"
          >
            {submitting ? '提交中...' : '提交答案'}
          </button>
          {!allAnswered && (
            <p className="text-gray-500 text-sm mt-2">
              请完成所有题目后提交
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd "D:/GoLand 2023.3/instant-check"
git add frontend/src/pages/QuizPage.tsx
git commit -m "feat(frontend): add QuizPage with scrollable question list"
```

---

## Task 13: ResultPage

**Files:**
- Create: `frontend/src/pages/ResultPage.tsx`

- [ ] **Step 1: Implement ResultPage component**

```tsx
// frontend/src/pages/ResultPage.tsx
import { useNavigate } from 'react-router-dom'
import type { AnalyzeResponse, QuizAnswer } from '../types'

interface Props {
  data: AnalyzeResponse | null
  answers: QuizAnswer[]
}

export default function ResultPage({ data, answers }: Props) {
  const navigate = useNavigate()

  if (!data || answers.length === 0) {
    navigate('/')
    return null
  }

  const questions = data.quiz.questions
  const correctCount = answers.filter(
    (a) => a.selected_answer === a.correct_answer
  ).length
  const total = answers.length
  const accuracy = Math.round((correctCount / total) * 100)
  const optionLabels = ['A', 'B', 'C', 'D']

  return (
    <div className="flex justify-center min-h-screen px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="text-5xl font-bold text-purple-400">
            {correctCount}/{total}
          </div>
          <p className="text-gray-400 mt-2">
            正确率 {accuracy}%，
            {accuracy >= 80
              ? '掌握良好！'
              : accuracy >= 60
                ? '还需加强。'
                : '建议重新阅读。'}
          </p>
          <div className="w-full bg-gray-800 rounded-full h-2 mt-4">
            <div
              className="bg-purple-500 h-2 rounded-full transition-all"
              style={{ width: `${accuracy}%` }}
            />
          </div>
        </div>

        <div className="space-y-3">
          {questions.map((q) => {
            const answer = answers.find((a) => a.question_id === q.id)
            if (!answer) return null
            const isCorrect = answer.selected_answer === q.correct_answer

            return (
              <div
                key={q.id}
                className={`bg-gray-900 rounded-xl p-4 border-l-4 ${
                  isCorrect ? 'border-green-500' : 'border-red-500'
                }`}
              >
                <div className="flex justify-between items-start">
                  <p className="text-white text-sm font-medium">
                    {q.id}. {q.question}
                  </p>
                  <span
                    className={`text-xs ml-2 whitespace-nowrap ${
                      isCorrect ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {isCorrect ? '✓ 正确' : '✗ 错误'}
                  </span>
                </div>

                {!isCorrect && (
                  <div className="mt-3 pt-3 border-t border-gray-800 text-xs">
                    <p className="text-red-400">
                      你的答案：{optionLabels[answer.selected_answer]}.{' '}
                      {q.options[answer.selected_answer]}
                    </p>
                    <p className="text-green-400 mt-1">
                      正确答案：{optionLabels[q.correct_answer]}.{' '}
                      {q.options[q.correct_answer]}
                    </p>
                    <p className="text-gray-400 mt-2">{q.explanation}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/')}
            className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition"
          >
            再来一篇 ↻
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd "D:/GoLand 2023.3/instant-check"
git add frontend/src/pages/ResultPage.tsx
git commit -m "feat(frontend): add ResultPage with score and explanations"
```

---

## Task 14: App Routing + Full Integration

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Wire up all pages in App.tsx**

```tsx
// frontend/src/App.tsx
import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import InputPage from './pages/InputPage'
import SummaryPage from './pages/SummaryPage'
import QuizPage from './pages/QuizPage'
import ResultPage from './pages/ResultPage'
import type { AnalyzeResponse, QuizAnswer } from './types'

function App() {
  const [analyzeData, setAnalyzeData] = useState<AnalyzeResponse | null>(null)
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([])

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <Routes>
          <Route
            path="/"
            element={<InputPage onAnalyzed={setAnalyzeData} />}
          />
          <Route
            path="/summary"
            element={<SummaryPage data={analyzeData} />}
          />
          <Route
            path="/quiz"
            element={
              <QuizPage data={analyzeData} onCompleted={setQuizAnswers} />
            }
          />
          <Route
            path="/result"
            element={<ResultPage data={analyzeData} answers={quizAnswers} />}
          />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 2: Clean up main.tsx**

```tsx
// frontend/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 3: Verify full flow works**

1. Start backend: `cd backend && DB_PASS=xxx ANTHROPIC_API_KEY=xxx go run cmd/server/main.go`
2. Start frontend: `cd frontend && npm run dev`
3. Open http://localhost:5173
4. Paste text → see summary → take quiz → see result

- [ ] **Step 4: Commit**

```bash
cd "D:/GoLand 2023.3/instant-check"
git add frontend/src/App.tsx frontend/src/main.tsx
git commit -m "feat(frontend): wire up all pages with routing and state"
```
