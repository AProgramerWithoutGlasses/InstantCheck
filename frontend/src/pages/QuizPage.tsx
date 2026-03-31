import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
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
    return <Navigate to="/" replace />
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

    await submitQuizResult(data!.id, answers)
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
