'use client'

import { useRef, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { ParsedStrategyPreview } from './types'

const MAX_ACTIVE = 50
const MAX_TEXT = 500

const EXAMPLES = [
  'NVDA MACD 골든크로스 시 알림',
  'TSLA 볼밴 하단 이탈 시 매수 알림',
  'AAPL 5일간 -10% 이상 하락 시 알림',
]

function conditionLine(c: ParsedStrategyPreview['conditions'][number]): string {
  const timeframe = c.timeframe ? `(${c.timeframe})` : ''
  return `${c.type}${timeframe} ${c.operator} ${c.value}`
}

interface StrategyRegisterFormProps {
  activeCount: number
  onCreated: () => void
}

export default function StrategyRegisterForm({ activeCount, onCreated }: StrategyRegisterFormProps) {
  const { show } = useToast()
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<ParsedStrategyPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // 마지막 preview 요청 token — 응답 도착 시 이 값과 다르면 stale (파싱 지연 최대 60s 대비).
  // 텍스트 변경/재요청 시 새 토큰으로 증가시켜 이전 응답을 무효화.
  const previewRequestIdRef = useRef(0)

  const overLimit = activeCount >= MAX_ACTIVE
  const overChars = text.length > MAX_TEXT
  const trimmed = text.trim()

  const handlePreview = async () => {
    if (!trimmed || previewLoading) return
    const requestId = ++previewRequestIdRef.current
    setPreviewLoading(true)
    setPreview(null)
    try {
      const res = await fetch('/api/custom-strategies/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      })
      // Stale 응답 무시 — 이 요청 이후 새 요청이 발생했거나 사용자가 텍스트를 바꿨을 수 있음.
      if (requestId !== previewRequestIdRef.current) return
      const json = await res.json()
      if (!res.ok) {
        show({ variant: 'error', title: json?.error ?? '파싱에 실패했습니다.' })
        return
      }
      setPreview(json.data as ParsedStrategyPreview)
    } catch (e) {
      console.error('[strategies] preview 실패:', e)
      if (requestId === previewRequestIdRef.current) {
        show({ variant: 'error', title: '파싱 요청 중 오류가 발생했습니다.' })
      }
    } finally {
      if (requestId === previewRequestIdRef.current) {
        setPreviewLoading(false)
      }
    }
  }

  const handleCreate = async () => {
    if (!preview || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/custom-strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      })
      const json = await res.json()
      if (!res.ok) {
        show({ variant: 'error', title: json?.error ?? '등록에 실패했습니다.' })
        return
      }
      show({ variant: 'success', title: `${json.data.name} 등록 완료` })
      setText('')
      setPreview(null)
      onCreated()
    } catch (e) {
      console.error('[strategies] create 실패:', e)
      show({ variant: 'error', title: '등록 요청 중 오류가 발생했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  const handleClear = () => {
    setText('')
    setPreview(null)
  }

  return (
    <section className="p-6 rounded-xl border border-border bg-card space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-bright font-bold text-base">새 전략 등록</h2>
          <p className="text-sub text-xs mt-1">
            자연어로 조건을 적어주면 AI가 파싱해 감시합니다 (최대 {MAX_TEXT}자, 활성 상한 {MAX_ACTIVE}개)
          </p>
        </div>
        <span
          className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
            overLimit ? 'border-red-500/40 bg-red-500/15 text-red-400' : 'border-border bg-surface text-sub'
          }`}
        >
          활성 <span className="text-bright ml-1">{activeCount}</span> / {MAX_ACTIVE}
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          if (preview) setPreview(null)
          // 텍스트 변경 시 기존 in-flight preview 요청 무효화
          previewRequestIdRef.current++
        }}
        placeholder="예: SOXL 이 40달러 이하 + RSI 30 이하가 되면 매수 알림"
        rows={3}
        className="w-full bg-surface-dim border border-border rounded-lg px-3.5 py-3 text-sm text-bright placeholder:text-dim focus:outline-none focus:border-sejin focus:ring-2 focus:ring-sejin/15 resize-y"
      />

      <div className="flex items-center justify-between">
        <div className="text-sub text-xs">
          <span className={`font-semibold ${overChars ? 'text-red-400' : 'text-bright'}`}>{text.length}</span> / {MAX_TEXT}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            disabled={!text || previewLoading || saving}
            className="px-3 py-1.5 text-sm text-sub hover:text-bright hover:bg-surface rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            지우기
          </button>
          <button
            onClick={handlePreview}
            disabled={!trimmed || overChars || overLimit || previewLoading || saving}
            className="px-3 py-1.5 rounded-md text-sm font-semibold bg-surface border border-border text-bright hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {previewLoading ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-sub border-t-transparent rounded-full animate-spin" />
                파싱 중…
              </span>
            ) : (
              <>👁️ 미리보기</>
            )}
          </button>
        </div>
      </div>

      {overLimit && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
          활성 전략 상한 {MAX_ACTIVE}개를 초과했습니다. 기존 전략을 비활성화하거나 삭제해주세요.
        </div>
      )}

      {preview && (
        <div className="rounded-lg bg-surface-dim border border-border p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-sejin/40 bg-sejin/15 text-sejin">
                ✅ 파싱 완료
              </span>
              <span className="text-bright font-semibold text-sm">{preview.name}</span>
              <span className="text-sub text-xs">{preview.ticker}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border border-sodam/30 bg-sodam/15 text-sodam">
                🗓️ {preview.frequency}
              </span>
              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border border-sodam/30 bg-sodam/10 text-sodam">
                {preview.logic}
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            {preview.conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 bg-surface rounded-md px-2.5 py-1.5 text-xs font-mono text-muted">
                  {conditionLine(c)}
                </div>
                {i < preview.conditions.length - 1 && (
                  <span className="text-sodam text-[10px] font-bold">{preview.logic}</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              onClick={() => setPreview(null)}
              disabled={saving}
              className="px-3 py-1.5 text-sm text-sub hover:text-bright hover:bg-surface rounded-md transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || overLimit}
              className="px-3 py-1.5 rounded-md text-sm font-semibold bg-bright text-bg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {saving ? '등록 중…' : '💾 등록하기'}
            </button>
          </div>
        </div>
      )}

      <div className="pt-3 border-t border-border">
        <p className="text-sub text-xs mb-2">💡 예시 (클릭하면 채워집니다)</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setText(ex)
                setPreview(null)
              }}
              className="text-left border border-dashed border-border rounded-lg px-3 py-2 text-xs text-sub bg-surface-dim hover:border-sejin/50 hover:text-bright hover:bg-sejin/5 transition-all"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
