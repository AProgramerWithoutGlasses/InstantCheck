package handler

import (
	"encoding/json"
	"log"
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
			log.Printf("scraper error for url %s: %v", req.Content, err)
			c.JSON(http.StatusBadRequest, gin.H{"error": "无法获取该网页内容"})
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
		start = time.Now()
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
		if result := h.DB.Create(&logEntry); result.Error != nil {
			log.Printf("failed to save analyze log: %v", result.Error)
		}
	}

	resp := AnalyzeResponse{ID: logEntry.ID}
	resp.Summary.KeyPoints = result.KeyPoints
	resp.Quiz.Questions = result.Questions

	c.JSON(http.StatusOK, resp)
}
