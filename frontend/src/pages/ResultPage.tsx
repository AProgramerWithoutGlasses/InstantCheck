import { useNavigate, Navigate } from 'react-router-dom'
import type { AnalyzeResponse, QuizAnswer } from '../types'

interface Props {
  data: AnalyzeResponse | null
  answers: QuizAnswer[]
}

export default function ResultPage({ data, answers }: Props) {
  const navigate = useNavigate()

  if (!data || answers.length === 0) {
    return <Navigate to="/" replace />
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
