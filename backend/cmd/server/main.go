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
