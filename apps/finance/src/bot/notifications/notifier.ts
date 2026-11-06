/**
 * pleiades M-5b (pleiades#136 · 003 §5-1 1a-4): 아웃바운드 알림을 @pleiades/notify 파사드로 보낸다.
 * 재시도 [2000, 8000, 30000] · HTML 변환 · 길이 분할은 패키지 코어가 소유한다.
 *
 * pleiades 009 D-5 B4 (pleiades#512): 텔레그램을 지웠다 — 라우트 스위치(`NOTIFY_ALLOWED_CHANNEL`·`NOTIFY_ADMIN_CHANNEL`·
 * `NOTIFY_INTERACTIVE_CHANNEL`)를 읽지 않고 늘 Discord 로 보낸다(009 §5-4 · fit B2 와 같은 형태).
 *   ALLOWED → `#finance` 웹훅(`DISCORD_WEBHOOK_FINANCE`) · ADMIN → `#admin` 웹훅(`DISCORD_WEBHOOK_ADMIN`)
 *   키보드 메시지(rsu D-day 확정 버튼) → fin Discord 봇(`DISCORD_BOT_TOKEN_FINANCE`·`DISCORD_CHANNEL_ID_FINANCE`)
 *   분기 PDF → ALLOWED 웹훅에 첨부(`sendFile`)
 * 설정이 비면 수신자 0(호출부 가드의 `total === 0` · 실행 판정 `recipients`·`fileRecipientCount`·`interactiveRecipientCount`).
 * 값은 pleiades 루트 `.env`(`platformEnv` · 프로세스 env 우선)에서 부를 때마다 읽는다 — 재시작 없이 반영된다.
 * `/브리핑` 응답은 요청한 Discord 채널로(`notifierForDiscordChannel` · 라우트를 타지 않는다).
 * 버튼 클릭은 봇 프로세스의 gateway(`discord-interactions.ts`)가 받는다.
 */

import {
  createDiscordBotTransport,
  createDiscordTransport,
  createNotifier,
  platformEnv,
  sendDiscordFile,
  type DiscordFile,
  type Notifier,
  type NotifyContext,
} from '@pleiades/notify'

export { Route, html as htmlContent } from '@pleiades/notify'
import type { BroadcastResult } from '@pleiades/notify'
export type { BroadcastResult }

type FinRoute = 'ALLOWED' | 'ADMIN'

const DISCORD_ALIAS: Readonly<Record<FinRoute, string>> = { ALLOWED: 'finance', ADMIN: 'admin' }

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

/** 그 라우트의 수신자 — 웹훅이 비면 0. */
const routeTargets = (route: FinRoute) => (): string[] => {
  const alias = DISCORD_ALIAS[route]
  return discordWebhooks()[alias] === '' ? [] : [alias]
}

const TARGETS = { ALLOWED: routeTargets('ALLOWED'), ADMIN: routeTargets('ADMIN') } as const

/** 호출부 공통 로그 컨텍스트 — 기존 `[notification] …` prefix 보존(003 Q26 ①). */
export const NOTIFY_CTX: NotifyContext = Object.freeze({ label: 'notification' })

/**
 * 텍스트 알림 파사드 — 라우트마다 그 웹훅. transport 는 인스턴스의 첫 전송 때 정해지므로
 * **인스턴스를 오래 쥐지 않고 보낼 때마다 만든다**(재시작 없는 설정 변경 · PR #144 Codex P2).
 */
export function notifierFor(): Notifier {
  return createNotifier({
    transport: () => createDiscordTransport({ webhooks: discordWebhooks }),
    targets: TARGETS,
  })
}

/**
 * 키보드가 붙은 메시지 전용(rsu D-day 확정 버튼) — fin Discord 봇으로 `#finance` 채널. 키보드는 버튼으로 변환된다.
 * 봇 설정이 없으면 수신자 0. fin 은 키보드 메시지의 id 를 저장하지 않는다 — DB 무관(Q61).
 */
export function interactiveNotifierFor(): Notifier {
  const discord = discordBotConfig()
  const alias = DISCORD_ALIAS.ALLOWED
  return createNotifier({
    transport: createDiscordBotTransport({ token: discord.token, channels: { [alias]: discord.channelId } }),
    targets: { ALLOWED: () => (discord.ready ? [alias] : []) },
  })
}

/**
 * 키보드 메시지 수신자 수(전송 없이) — fin Discord 봇 설정 유무(0/1).
 * 스케줄 가드가 RSU 확정 작업을 건너뛸지 판단할 때 쓴다 — 텍스트 수신자 0 · 봇만 설정한 경우도 실행돼야 한다(PR #156 Codex P1).
 */
export function interactiveRecipientCount(): number {
  return discordBotConfig().ready ? 1 : 0
}

const DISCORD_ID_RE = /^\d{5,25}$/

/** fin Discord 봇 설정 — 토큰·채널 ID·허용 사용자. `ready` 는 토큰과 채널 ID 형식이 갖춰졌는지. 값은 로그에 쓰지 않는다. */
export function discordBotConfig(): { token: string; channelId: string; allowedUserIds: string[]; ready: boolean } {
  const token = (platformEnv('DISCORD_BOT_TOKEN_FINANCE') ?? '').trim()
  const channelId = (platformEnv('DISCORD_CHANNEL_ID_FINANCE') ?? '').trim()
  const allowedUserIds = (platformEnv('DISCORD_ALLOWED_USER_IDS') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => DISCORD_ID_RE.test(v))
  return { token, channelId, allowedUserIds, ready: token !== '' && DISCORD_ID_RE.test(channelId) }
}

/** 대화 채널 키(009 D-3 K · pleiades#398) — 비어 있거나 형식이 아니면 메시지 수신을 켜지 않는다(스위치를 겸한다). */
export const DISCORD_CHAT_CHANNEL_KEY = 'DISCORD_CHANNEL_ID_FINANCE_CHAT'

/**
 * fin 대화 채널 ID — 부를 때마다 읽는다(프로세스 env → 루트 `.env`). 형식(숫자 5~25자리)이 아니면 "".
 * 알림 채널(`DISCORD_CHANNEL_ID_FINANCE`)과 같은 값이어도 된다(009 C-7 정정). 값은 로그에 쓰지 않는다.
 */
export function discordChatChannelId(): string {
  const v = (platformEnv(DISCORD_CHAT_CHANNEL_KEY) ?? '').trim()
  return DISCORD_ID_RE.test(v) ? v : ''
}

/**
 * Discord 로 받은 봇 명령의 on-demand 발송 — 요청한 채널 하나에만(`/브리핑` · 009 D-3 D2 · pleiades#398).
 * 라우트 웹훅을 타지 않는다. fin 봇 토큰이 비면 수신자 0. notifier 는 던지지 않으므로 **안 나갔으면(`sent=0`) 경고 줄 1** 을
 * 여기서 남긴다(크론과 같은 실패 표면 · IDENTIFY 차단 알림과 같은 형태).
 */
export function notifierForDiscordChannel(channelId: string): Notifier {
  const token = discordBotConfig().token
  const inner = createNotifier({
    transport: createDiscordBotTransport({ token, channels: { req: channelId } }),
    targets: { ALLOWED: () => (token === '' ? [] : ['req']) },
  })
  return {
    targetCount: (route) => inner.targetCount(route),
    targets: (route) => inner.targets(route),
    notify: async (route, content, ctx) => {
      const r = await inner.notify(route, content, ctx)
      if (r.sent === 0) console.warn(`[discord-fin] 요청 채널 발송 안 됨 (sent=0/total=${r.total} · ${ctx?.label ?? 'notify'})`)
      return r
    },
  }
}

/**
 * 첨부 파일(분기 PDF · 003 §7-4 포트 밖) — 그 라우트의 웹훅에 첨부한다(M-6b-1 #147).
 *   'no-webhook' → 웹훅이 비었다 — 수신자 0(텍스트 알림과 같은 의미)
 *   'sent'       → 보냈다(실패는 throw)
 */
export async function sendFile(route: FinRoute, file: DiscordFile, caption: string): Promise<'no-webhook' | 'sent'> {
  const alias = DISCORD_ALIAS[route]
  const url = discordWebhooks()[alias] // 한 번 읽어 고정 — 판정과 전송 사이에 .env 가 바뀌어도 어긋나지 않게
  if (url === '') return 'no-webhook'
  await sendDiscordFile({ webhooks: { [alias]: url } }, alias, file, caption)
  return 'sent'
}

/** 첨부(분기 PDF)를 받을 수신자 수 — 웹훅 유무(0/1). 비싼 생성(AI·PDF) 전에 확인한다(PR #148 Codex P2). */
export function fileRecipientCount(route: FinRoute): number {
  return routeTargets(route)().length
}

/**
 * 전송 없이 수신자만 본다 — `length === 0` 가드 · 분모 · 목록(003 발견 19 · Q25 ①).
 * 스케줄 등록 전 가드에서도 쓸 수 있도록 transport 는 만들지 않는다.
 */
export const recipients: Pick<Notifier, 'targetCount' | 'targets'> = createNotifier({
  transport: () => {
    throw new Error('recipients 는 전송하지 않는다 — notifierFor() 를 쓴다')
  },
  targets: TARGETS,
})

/**
 * 구 per-chat 루프의 `lastError`(마지막 실패 대상의 raw `error.message`)를 결과에서 복원한다 — 003 발견 17 · Q19 C(raw 보존).
 * DB `AlertHistory.lastError` 에 그대로 저장되던 값과 같은 형태다.
 *
 * 패키지 `Delivery.error` 문서는 DB·API 에 쓰기 전 sanitize 를 요구하지만, 여기서는 **의도적으로 raw 를
 * 유지한다** — 구 동작 보존(Q19 C). sanitize 적용은 #137 에서 다룬다.
 */
export function lastErrorOf(result: BroadcastResult): string | undefined {
  return result.deliveries.filter((d) => !d.ok).at(-1)?.error
}
