/**
 * pleiades M-5b (pleiades#136 · 003 §5-1 1a-4): 아웃바운드 알림을 @pleiades/notify 파사드로 보낸다.
 *
 * 구 `sendHtml` 루프(per-chat try/catch)를 대체 — 재시도 [2000, 8000, 30000] · HTML→plain 폴백 ·
 * 4096 초과 줄 경계 분할은 패키지 코어가 소유한다. 수신자 env 는 fin 규칙 그대로(`numericOnly` —
 * 비숫자 토큰 탈락 · 숫자 정규화 보존 · `total` = AlertHistory.recipientCount 값이 바뀌지 않는다).
 *   ALLOWED → TELEGRAM_ALLOWED_CHAT_IDS · ADMIN → TELEGRAM_ADMIN_CHAT_IDS (003 Q25 ADMIN A)
 */

import type { Bot } from 'grammy'
import {
  createNotifier,
  createTelegramTransport,
  csvEnv,
  type Notifier,
  type NotifyContext,
} from '@pleiades/notify'

export { Route, html as htmlContent } from '@pleiades/notify'
import type { BroadcastResult } from '@pleiades/notify'
export type { BroadcastResult }

const TARGETS = {
  ALLOWED: csvEnv('TELEGRAM_ALLOWED_CHAT_IDS', { numericOnly: true }),
  ADMIN: csvEnv('TELEGRAM_ADMIN_CHAT_IDS', { numericOnly: true }),
} as const

/** 호출부 공통 로그 컨텍스트 — 기존 `[notification] …` prefix 보존(003 Q26 ①). */
export const NOTIFY_CTX: NotifyContext = Object.freeze({ label: 'notification' })

/** 봇 인스턴스로 파사드를 만든다. */
export function notifierFor(bot: Bot): Notifier {
  return createNotifier({
    transport: createTelegramTransport({ api: bot.api }),
    targets: TARGETS,
  })
}

/**
 * 요청한 chat 하나에만 보낸다 — 봇 명령의 on-demand 발송(`/브리핑` → `sendBriefing(session, chatId)`).
 * 재시도·폴백·분할 정책은 `notifierFor` 와 같고, 대상만 그 chat 으로 고정한다(구 `sendBriefing([chatId], …)` 보존).
 */
export function notifierForChat(bot: Bot, chatId: number): Notifier {
  return createNotifier({
    transport: createTelegramTransport({ api: bot.api }),
    targets: { ALLOWED: () => [String(chatId)] },
  })
}

/**
 * 전송 없이 수신자만 본다 — `length === 0` 가드 · 분모 · 목록(003 발견 19 · Q25 ①).
 * 봇이 없는 경로(스케줄 등록 전 가드)에서도 쓸 수 있도록 transport 는 만들지 않는다.
 */
export const recipients: Pick<Notifier, 'targetCount' | 'targets'> = createNotifier({
  transport: () => {
    throw new Error('recipients 는 전송하지 않는다 — notifierFor(bot) 을 쓴다')
  },
  targets: TARGETS,
})

/**
 * 구 per-chat 루프의 `lastError`(마지막 실패 chat 의 raw `error.message`)를 결과에서 복원한다 — 003 발견 17 · Q19 C(raw 보존).
 * DB `AlertHistory.lastError` 에 그대로 저장되던 값과 같은 형태다.
 */
export function lastErrorOf(result: BroadcastResult): string | undefined {
  return result.deliveries.filter((d) => !d.ok).at(-1)?.error
}
