/**
 * 텔레그램 HTML 전송 유틸
 *
 * parse_mode: 'HTML'로 전송하되, 실패 시 plain text fallback.
 * 모든 메시지에서 일관되게 사용.
 */

import { Context } from 'grammy'
import { Bot } from 'grammy'
import { splitMessage } from './formatter'

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
 * 안전하게 재시도 가능한 네트워크 에러 판별.
 * ETIMEDOUT/ENOTFOUND만 재시도 (연결 자체 실패 → 요청 미도달 보장).
 * ECONNRESET은 요청 도달 후 응답 실패일 수 있어 중복 메시지 위험 → 재시도 안 함.
 */
function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const inner = (error as { error?: { code?: string } }).error
  return inner?.code === 'ETIMEDOUT' || inner?.code === 'ENOTFOUND'
}

/**
 * 재시도 래퍼: 네트워크 에러 시 지수 백오프로 재시도 (최대 2회)
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isRetryableNetworkError(error) || attempt === maxRetries) throw error
      const delay = 1000 * (attempt + 1) // 1초, 2초
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError
}
