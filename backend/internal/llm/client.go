package llm

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
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
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		log.Fatal("ANTHROPIC_API_KEY environment variable is not set")
	}
	return &Client{
		apiKey:     apiKey,
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

	rawText := strings.TrimSpace(apiResp.Content[0].Text)
	// Strip markdown code fences if present
	rawText = strings.TrimPrefix(rawText, "```json")
	rawText = strings.TrimPrefix(rawText, "```")
	rawText = strings.TrimSuffix(rawText, "```")
	rawText = strings.TrimSpace(rawText)

	var result AnalyzeResult
	if err := json.Unmarshal([]byte(rawText), &result); err != nil {
		return nil, 0, fmt.Errorf("failed to parse LLM JSON output: %w\nraw: %s", err, rawText)
	}

	tokenUsage := apiResp.Usage.InputTokens + apiResp.Usage.OutputTokens
	return &result, tokenUsage, nil
}
