import { useNavigate, Navigate } from 'react-router-dom'
import type { AnalyzeResponse } from '../types'

interface Props {
  data: AnalyzeResponse | null
}

export default function SummaryPage({ data }: Props) {
  const navigate = useNavigate()

  if (!data) {
    return <Navigate to="/" replace />
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
