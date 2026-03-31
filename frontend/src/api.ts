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
  const resp = await fetch('/api/quiz-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analyze_id: analyzeId, answers }),
  })

  if (!resp.ok) {
    console.error('Failed to submit quiz result:', resp.status)
  }
}
