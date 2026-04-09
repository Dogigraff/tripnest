import React, { useState, useCallback } from 'react'
import Modal from './shared/Modal'
import { Loader2, Sparkles } from 'lucide-react'
import { aiApi } from '../api/client'
import { getApiErrorMessage } from '../types'

interface AiPlanDay {
  day?: number
  title?: string
  places?: unknown[]
}

interface AiPlanResponse {
  days?: AiPlanDay[]
  total_budget_usd?: number
  tips?: string[]
}

interface AIPlannerModalProps {
  isOpen: boolean
  onClose: () => void
  tripId: number | string
  userId: number
  onSuccess: () => void
}

export default function AIPlannerModal({
  isOpen,
  onClose,
  tripId,
  userId,
  onSuccess,
}: AIPlannerModalProps): React.ReactElement {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)

  const handleClose = useCallback(() => {
    if (loading) return
    setPrompt('')
    setError(null)
    setSummary(null)
    onClose()
  }, [loading, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = prompt.trim()
    if (!text || loading) return
    setLoading(true)
    setError(null)
    setSummary(null)
    try {
      const plan = (await aiApi.plan({
        prompt: text,
        tripId,
        userId,
      })) as AiPlanResponse

      const days = Array.isArray(plan.days) ? plan.days : []
      const lines = days.map((d) => {
        const n = typeof d.day === 'number' ? d.day : days.indexOf(d) + 1
        const title = typeof d.title === 'string' && d.title ? d.title : `Day ${n}`
        const count = Array.isArray(d.places) ? d.places.length : 0
        return `${title}: ${count} place(s)`
      })
      const budget =
        typeof plan.total_budget_usd === 'number'
          ? `\nTotal budget (estimate): $${plan.total_budget_usd}`
          : ''
      setSummary(lines.length > 0 ? `${lines.join('\n')}${budget}` : 'Plan generated.')
      onSuccess()
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Could not generate plan'))
    } finally {
      setLoading(false)
    }
  }

  const handleDone = () => {
    setSummary(null)
    setPrompt('')
    setError(null)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          AI trip planner
        </span>
      }
      size="lg"
    >
      {summary ? (
        <div className="space-y-4">
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Generated schedule
          </p>
          <pre
            className="text-sm whitespace-pre-wrap rounded-lg p-3 border"
            style={{
              background: 'var(--bg-tertiary)',
              borderColor: 'var(--border-secondary)',
              color: 'var(--text-secondary)',
              fontFamily: 'inherit',
            }}
          >
            {summary}
          </pre>
          <button
            type="button"
            onClick={handleDone}
            className="w-full py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Describe your trip — we&apos;ll add suggested places to this trip and assign them by day.
          </p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="7 days in Tokyo, budget $2000, I love food and anime"
            rows={5}
            disabled={loading}
            className="w-full rounded-lg border px-3 py-2 text-sm resize-y min-h-[120px]"
            style={{
              borderColor: 'var(--border-primary)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
            }}
          />
          {error && (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating…
              </>
            ) : (
              'Generate with AI'
            )}
          </button>
        </form>
      )}
    </Modal>
  )
}
