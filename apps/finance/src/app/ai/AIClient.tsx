'use client'

import { useState, useRef, useEffect, FormEvent } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  html?: string // assistant 메시지의 렌더링된 HTML (미리 계산)
}

const PRESETS = [
  { emoji: '📊', label: '전체 현황', prompt: '전체 포트폴리오 현황을 분석해줘' },
  { emoji: '👧', label: '소담 계좌', prompt: '소담 계좌 현황과 증여세 한도를 확인해줘' },
  { emoji: '👶', label: '다솜 계좌', prompt: '다솜 계좌 현황과 증여세 한도를 확인해줘' },
  { emoji: '💼', label: '세진 계좌', prompt: '세진 계좌 상세 현황과 수익률을 분석해줘' },
  { emoji: '📈', label: '수익률 비교', prompt: '전체 계좌의 최근 3개월 수익률을 비교 분석해줘' },
  { emoji: '💸', label: '이번 달 소비', prompt: '이번 달 소비/수입 현황을 분석해줘' },
  { emoji: '🔮', label: '성장 시뮬', prompt: '소담, 다솜 계좌의 10년 성장 시뮬레이션을 해줘' },
  { emoji: '💱', label: '환율 현황', prompt: '현재 환율과 보유 종목 시세를 알려줘' },
] as const

function generateId(): string {
  return crypto.randomUUID()
}

/**
 * 간단 마크다운 → HTML 변환
 * XSS 방지를 위해 먼저 이스케이프 후 마크다운 태그만 허용
 */
/**
 * marked + DOMPurify로 마크다운 → 안전한 HTML 변환
 */
function renderMarkdown(text: string): string {
  const rawHtml = marked.parse(text, { async: false, gfm: true, breaks: true }) as string
  return DOMPurify.sanitize(rawHtml)
}

export default function AIClient() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // unmount 시 진행 중인 요청 취소
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  const sendMessage = async (prompt: string) => {
    if (!prompt.trim() || isLoading) return

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: prompt.trim(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    // 이전 요청 취소
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
        signal: controller.signal,
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'AI 응답 실패')
      }

      const aiContent = data.response
      const aiMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: aiContent,
        html: renderMarkdown(aiContent),
      }
      setMessages((prev) => [...prev, aiMsg])
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      const errContent = `⚠️ ${error instanceof Error ? error.message : 'AI 응답 처리에 실패했습니다.'}`
      const errMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: errContent,
        html: renderMarkdown(errContent),
      }
      setMessages((prev) => [...prev, errMsg])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleClear = () => {
    setMessages([])
    setInput('')
    inputRef.current?.focus()
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 57px)' }}>
      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
        {isEmpty ? (
          /* 빈 상태: 프리셋 그리드 */
          <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center text-3xl mb-4">
              🤖
            </div>
            <h2 className="text-[18px] font-bold text-bright">AI 어드바이저</h2>
            <p className="text-[13px] text-sub mt-1">
              포트폴리오, 세금, 소비 현황을 분석해드립니다
            </p>
            <p className="text-[11px] text-dim mt-1">
              각 질문은 독립적으로 처리됩니다
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full mt-8">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => sendMessage(p.prompt)}
                  className="group flex flex-col items-center gap-2 p-4 rounded-xl
                    bg-surface-dim border border-border
                    hover:bg-surface hover:border-border-hover
                    transition-all duration-200 text-center"
                >
                  <span className="text-2xl group-hover:scale-110 transition-transform">
                    {p.emoji}
                  </span>
                  <span className="text-[12px] text-sub group-hover:text-muted font-medium">
                    {p.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* 대화 메시지 */
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center text-sm mr-3 mt-1 flex-shrink-0">
                    🤖
                  </div>
                )}
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed
                    ${msg.role === 'user'
                      ? 'bg-sejin/15 text-bright rounded-br-md'
                      : 'bg-card border border-border text-text rounded-bl-md'
                    }`}
                >
                  {msg.role === 'assistant' ? (
                    <div
                      className="ai-markdown"
                      dangerouslySetInnerHTML={{ __html: msg.html ?? renderMarkdown(msg.content) }}
                    />
                  ) : (
                    <span>{msg.content}</span>
                  )}
                </div>
              </div>
            ))}

            {/* 로딩 */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center text-sm mr-3 mt-1 flex-shrink-0">
                  🤖
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-sejin/60 animate-bounce" />
                    <div className="w-2 h-2 rounded-full bg-sejin/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-sejin/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 하단 입력 */}
      <div className="border-t border-border bg-bg-raised px-4 sm:px-8 py-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="질문을 입력하세요..."
            disabled={isLoading}
            className="flex-1 bg-surface border border-border rounded-xl px-4 py-3
              text-[13px] text-text placeholder:text-dim
              focus:outline-none focus:border-sejin/40 focus:ring-1 focus:ring-sejin/20
              disabled:opacity-50 transition-all"
          />
          {!isEmpty && (
            <button
              type="button"
              onClick={handleClear}
              disabled={isLoading}
              className="px-4 py-3 bg-surface-dim text-sub border border-border
                rounded-xl text-[13px] font-medium
                hover:bg-surface hover:text-bright disabled:opacity-30
                transition-all flex-shrink-0"
            >
              새 대화
            </button>
          )}
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-5 py-3 bg-sejin/15 text-sejin border border-sejin/20
              rounded-xl text-[13px] font-semibold
              hover:bg-sejin/25 disabled:opacity-30
              transition-all duration-200 flex-shrink-0"
          >
            전송
          </button>
        </form>

        {/* 대화 중 프리셋 칩 */}
        {!isEmpty && !isLoading && (
          <div className="max-w-3xl mx-auto mt-3 flex gap-2 overflow-x-auto pb-1">
            {PRESETS.slice(0, 4).map((p) => (
              <button
                key={p.label}
                onClick={() => sendMessage(p.prompt)}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5
                  bg-surface-dim border border-border rounded-full
                  text-[11px] text-sub hover:text-muted hover:bg-surface
                  transition-all whitespace-nowrap"
              >
                <span>{p.emoji}</span>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
