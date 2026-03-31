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
