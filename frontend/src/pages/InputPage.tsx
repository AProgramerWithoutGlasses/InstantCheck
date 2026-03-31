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
