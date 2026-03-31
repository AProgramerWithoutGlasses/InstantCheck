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
