/**
 * 텔레그램 HTML 전송 유틸
 *
 * parse_mode: 'HTML'로 전송하되, 실패 시 plain text fallback.
 * 모든 메시지에서 일관되게 사용.
 */

import { Context } from 'grammy'
import { Bot } from 'grammy'
import { splitMessage } from './formatter'
import { isNetworkError, sanitizeError } from './error'

/**
 * HTML 특수문자 이스케이프 (텔레그램 HTML parse_mode용)
 * <b>, <i>, <code>, <pre>, <a>, <blockquote> 태그 외에는 이스케이프 필수
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * 텔레그램 HTML 포맷 헬퍼
 */
export const h = {
  b: (text: string) => `<b>${text}</b>`,
  i: (text: string) => `<i>${text}</i>`,
  code: (text: string) => `<code>${text}</code>`,
  pre: (text: string) => `<pre>${text}</pre>`,
}

/**
 * ctx.reply를 HTML parse_mode로 전송 + fallback
 */
export async function replyHtml(ctx: Context, html: string): Promise<void> {
  const chunks = splitMessage(html)
  for (const chunk of chunks) {
    try {
      await withRetry(() => ctx.reply(chunk, { parse_mode: 'HTML' }))
    } catch (error) {
      if (isParseError(error)) {
        const plain = chunk.replace(/<[^>]+>/g, '')
        await withRetry(() => ctx.reply(plain))
      } else {
        throw error
      }
    }
  }
}

/**
 * bot.api.sendMessage를 HTML parse_mode로 전송 + fallback
 */
export async function sendHtml(
  bot: Bot,
  chatId: number,
  html: string
): Promise<void> {
  const chunks = splitMessage(html)
  for (const chunk of chunks) {
    try {
      await withRetry(() => bot.api.sendMessage(chatId, chunk, { parse_mode: 'HTML' }))
    } catch (error) {
      if (isParseError(error)) {
        const plain = chunk.replace(/<[^>]+>/g, '')
        await withRetry(() => bot.api.sendMessage(chatId, plain))
      } else {
        throw error
      }
    }
  }
}

/**
 * 텔레그램 API의 HTML 파싱 오류 여부 판별 (400 Bad Request)
 */
function isParseError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'error_code' in error) {
    return (error as { error_code: number }).error_code === 400
  }
  // grammY의 HttpError
  if (error instanceof Error && error.message.includes("can't parse")) {
    return true
  }
  return false
}

/**
 * 시도 사이 sleep — 2s/8s/30s (총 4회 시도 = 초기 + 3 재시도).
 * IPv4 강제(src/bot/index.ts) 이후에도 일시 네트워크 흔들림에 대비. myFitness #108 통일.
 */
const RETRY_DELAYS_MS = [2000, 8000, 30000]

/**
 * 재시도 래퍼: 네트워크 에러 시 지수 백오프. ETIMEDOUT/ECONNRESET/ENETUNREACH/grammy timeout/abort 등
 * 광범위하게 포착 (`isNetworkError` — src/bot/utils/error.ts).
 *
 * 주의: send 가 성공 후 응답 도착 전 끊긴 경우 (ECONNRESET 등) 중복 메시지 위험은 있으나,
 * 운영 시나리오상 사용자 1명 → cron 누락보다 중복 위험이 작다.
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  const maxAttempts = RETRY_DELAYS_MS.length + 1
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isNetworkError(error) || attempt === maxAttempts - 1) throw error
      const delay = RETRY_DELAYS_MS[attempt]
      console.warn(`[bot] 전송 재시도 ${attempt + 1}/${maxAttempts} (${delay}ms 후): ${sanitizeError(error)}`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError
}
