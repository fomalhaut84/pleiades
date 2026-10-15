/**
 * pleiades M-5b (pleiades#136 · 003 §5-1 1a-4): 아웃바운드 알림을 @pleiades/notify 파사드로 보낸다.
 *
 * 구 `sendHtml` 루프(per-chat try/catch)를 대체 — 재시도 [2000, 8000, 30000] · HTML→plain 폴백 ·
 * 4096 초과 줄 경계 분할은 패키지 코어가 소유한다. 수신자 env 는 fin 규칙 그대로(`numericOnly` —
 * 비숫자 토큰 탈락 · 숫자 정규화 보존 · `total` = AlertHistory.recipientCount 값이 바뀌지 않는다).
 *   ALLOWED → TELEGRAM_ALLOWED_CHAT_IDS · ADMIN → TELEGRAM_ADMIN_CHAT_IDS (003 Q25 ADMIN A)
 *
 * pleiades M-6a-2 (pleiades#143 · 003 §6 1b-1): 라우트별로 Discord 를 고를 수 있다 — 미설정이면 지금과 같다(텔레그램).
 * 값은 pleiades 루트 `.env`(`platformEnv` · 프로세스 env 우선)에서 읽는다 — 앱 실행 방식(run.sh · npm run dev · pm2)과 무관.
 *   NOTIFY_ALLOWED_CHANNEL=discord → `#finance` (DISCORD_WEBHOOK_FINANCE)
 *   NOTIFY_ADMIN_CHANNEL=discord   → `#admin`   (DISCORD_WEBHOOK_ADMIN)
 * 키보드 메시지(`interactiveNotifierFor`) · `/브리핑` 응답(`notifierForChat`) · 분기 PDF 목록(`telegramRecipients`)은
 * 항상 텔레그램 — Discord 는 인터랙션·첨부를 받지 못한다(1b-2 · 혼합 운영 Q11).
 */

import type { Bot } from 'grammy'
import {
  createDiscordTransport,
  createNotifier,
  createTelegramTransport,
  csvEnv,
  platformEnv,
  type Notifier,
  type NotifyContext,
  type Transport,
} from '@pleiades/notify'

export { Route, html as htmlContent } from '@pleiades/notify'
import type { BroadcastResult } from '@pleiades/notify'
export type { BroadcastResult }

type FinRoute = 'ALLOWED' | 'ADMIN'

const TELEGRAM_TARGETS = {
  ALLOWED: csvEnv('TELEGRAM_ALLOWED_CHAT_IDS', { numericOnly: true }),
  ADMIN: csvEnv('TELEGRAM_ADMIN_CHAT_IDS', { numericOnly: true }),
} as const

const DISCORD_ALIAS: Readonly<Record<FinRoute, string>> = { ALLOWED: 'finance', ADMIN: 'admin' }

/** 그 라우트를 Discord 로 보내는가 — 호출 시점마다 읽는다(프로세스 env → 루트 `.env` · 파일은 수정 시각이 바뀌면 다시 읽는다). */
export function usesDiscord(route: FinRoute): boolean {
  return (platformEnv(`NOTIFY_${route}_CHANNEL`) ?? '').trim().toLowerCase() === 'discord'
}

/**
 * Discord 웹훅 URL 형식 — 아니면 비운다(수신자 0). 잘못된 값(따옴표·공백 섞임)을 그대로 쓰면 undici 가
 * `Failed to parse URL from <url>` 로 토큰 담긴 URL 을 오류 메시지에 싣고, 그것이 AlertHistory.lastError 로 간다(#143 사전 리뷰 info).
 */
const WEBHOOK_RE = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+(?:\?[\w=&-]*)?$/
export function webhookEnv(name: string): string {
  const v = (platformEnv(name) ?? '').trim()
  return WEBHOOK_RE.test(v) ? v : ''
}

const discordWebhooks = (): Record<string, string> => ({
  finance: webhookEnv('DISCORD_WEBHOOK_FINANCE'),
  admin: webhookEnv('DISCORD_WEBHOOK_ADMIN'),
})

/** Discord 를 골랐는데 웹훅이 비면 수신자 0 — 텔레그램 env 미설정과 같은 의미(가드가 건너뛴다). */
const routedTargets = (route: FinRoute) => (): string[] => {
  if (!usesDiscord(route)) return TELEGRAM_TARGETS[route]()
  const alias = DISCORD_ALIAS[route]
  return discordWebhooks()[alias] === '' ? [] : [alias]
}

const TARGETS = { ALLOWED: routedTargets('ALLOWED'), ADMIN: routedTargets('ADMIN') } as const

/** 호출부 공통 로그 컨텍스트 — 기존 `[notification] …` prefix 보존(003 Q26 ①). */
export const NOTIFY_CTX: NotifyContext = Object.freeze({ label: 'notification' })

/**
 * 봇 인스턴스로 파사드를 만든다 — 라우트마다 텔레그램 또는 Discord. transport 는 인스턴스의 첫 전송 때 정해지므로
 * **인스턴스를 오래 쥐지 않고 보낼 때마다 만든다**(재시작 없는 채널 전환 · PR #144 Codex P2).
 */
export function notifierFor(bot: Bot): Notifier {
  const transportFor = (route: FinRoute) => (): Transport =>
    usesDiscord(route)
      ? createDiscordTransport({ webhooks: discordWebhooks })
      : createTelegramTransport({ api: bot.api })
  return createNotifier({
    transport: { ALLOWED: transportFor('ALLOWED'), ADMIN: transportFor('ADMIN') },
    targets: TARGETS,
  })
}

/**
 * 키보드가 붙은 메시지 전용 — 항상 텔레그램(`NOTIFY_ALLOWED_CHANNEL` 무시 · rsu D-day 확정 버튼).
 */
export function interactiveNotifierFor(bot: Bot): Notifier {
  return createNotifier({
    transport: createTelegramTransport({ api: bot.api }),
    targets: { ALLOWED: TELEGRAM_TARGETS.ALLOWED },
  })
}

/** 텔레그램 수신자 목록 — 포트 밖 `sendDocument`(분기 PDF · 003 §7-4)처럼 텔레그램 API 를 직접 부르는 곳. */
export function telegramRecipients(route: FinRoute): string[] {
  return TELEGRAM_TARGETS[route]()
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
 *
 * 패키지 `Delivery.error` 문서는 DB·API 에 쓰기 전 sanitize 를 요구하지만(봇 토큰 포함 가능), 여기서는 **의도적으로 raw 를
 * 유지한다** — 구 동작 보존(Q19 C · M-5b 는 동작 변경 최소). sanitize 적용은 후속 pleiades 이슈에서 다룬다.
 */
export function lastErrorOf(result: BroadcastResult): string | undefined {
  return result.deliveries.filter((d) => !d.ok).at(-1)?.error
}
