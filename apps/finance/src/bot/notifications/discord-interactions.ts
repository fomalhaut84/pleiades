/**
 * pleiades M-6b-4 (pleiades#155 · 003 §6 1b-2b): Discord 버튼 클릭을 받는 gateway — 봇 프로세스에서 텔레그램 롱폴링과 함께 돈다.
 * 토큰·채널이 설정돼 있으면 스위치(NOTIFY_INTERACTIVE_CHANNEL)와 무관하게 접속한다 — 스위치를 나중에 켜도(루트 .env)
 * 재시작 없이 버튼이 동작하게. 허용 = DISCORD_ALLOWED_USER_IDS AND 그 채널(#147 결정). 판단은 텔레그램과 같은 decideVest.
 *
 * Discord 3초 응답 제한은 gateway 계층이 처리한다 — 클릭 즉시 DEFERRED_UPDATE_MESSAGE 후 종가 조회·트랜잭션을 기다려
 * 원본을 수정한다(interaction 토큰 유효 15분).
 *
 * pleiades 009 D-1 (pleiades#349): gateway 를 `@pleiades/chat` 으로 옮겼다 — IDENTIFY 보호(0-5)가 chat 에만 있다.
 * intents 0(버튼만 · 포털 MESSAGE CONTENT 토글 불필요) · IDENTIFY 기록 `logs/identify-fin.json`(cwd = apps/finance · 모든 태그에서 무시).
 * 아래 두 로그 문구와 label `discord-fin` 은 deploy/discord-switch.sh 판정 문자열이다 — 바꾸지 않는다(deploy/test_discord_switch.py).
 *
 * pleiades 009 D-3 PR-3 (pleiades#398 · 설계 K · F · H): 대화 채널 키 `DISCORD_CHANNEL_ID_FINANCE_CHAT`(루트 플랫폼 env · 선택)가
 * 메시지 수신 스위치다 — 비면 D-1 과 같다(버튼만). 채우면 그 채널의 메시지를 명령·자유 텍스트로 받는다(`discord/router.ts`).
 * 메시지 채널 = [대화] · 버튼 채널 = [알림, 대화]. 기동 로그 1줄(켜짐/꺼짐)은 deploy/discord-inbound.sh 판정 문자열.
 */

import path from 'node:path'
import { createChat, createIdentifyGuard, fileGuardStore, MESSAGE_INTENTS, type Chat } from '@pleiades/chat'
import { createDiscordRouter } from '@/bot/discord/router'
import { discordBotConfig, discordChatChannelId, htmlContent, notifierFor, NOTIFY_CTX, Route, type NotifyBot } from './notifier'

// 버튼 핸들러는 discord/vest-button.ts(pleiades#398) — 기존 import 경로를 지킨다
export { handleDiscordButton } from '@/bot/discord/vest-button'

const LABEL = 'discord-fin'
/** cwd 상대 — pm2·run.sh 모두 apps/finance 에서 띄운다(deploy/pleiades.config.cjs). */
export const IDENTIFY_RECORD = path.join('logs', 'identify-fin.json')

/** 라우터 — 메시지(대화 채널 키가 있을 때만 온다)와 버튼. 봇 핸들을 쓰지 않으므로 모듈 하나로 둔다. */
export const discordRouter = createDiscordRouter()

/** 기동 로그 — deploy/discord-inbound.sh 판정 문자열(009 D-3 K · pleiades#398). 바꾸지 않는다(deploy/test_discord_inbound.py). */
export const INBOUND_ON_LOG = '[discord-fin] 메시지 수신 켜짐(대화 채널)'
export const INBOUND_OFF_LOG = '[discord-fin] 메시지 수신 꺼짐(버튼만)'

/** 메시지 채널 = [대화 채널] — 부를 때마다 읽는다(실행 중 키를 비우면 다음 메시지부터 무시 · 2-3). */
export function messageChannels(): string[] {
  const chat = discordChatChannelId()
  return chat === '' ? [] : [chat]
}

/** 버튼 채널 = [알림 채널, 대화 채널] — 빈 값·중복 제거(대화 채널 = 알림 채널이어도 된다 · 009 C-7 정정). */
export function buttonChannels(): string[] {
  const ids = [discordBotConfig().channelId, discordChatChannelId()].filter((v) => v !== '')
  return [...new Set(ids)]
}

/**
 * 4014 강등 알림 1회(설계 F) — ADMIN(fin 은 ADMIN 을 매핑하고 IDENTIFY 차단 알림도 ADMIN 이다 · fit 은 ALLOWED).
 * Discord 봇 토큰과 무관한 notifier(웹훅 · 텔레그램)로 보낸다.
 */
export async function notifyIntentsFallback(notifyBot: NotifyBot): Promise<void> {
  const msg =
    '⚠️ <b>fin Discord 메시지 수신 꺼짐</b>\n개발자 포털 MESSAGE CONTENT 토글이 꺼져 있어(4014) 버튼만 받는다. ' +
    '토글을 켠 뒤 봇을 재시작하거나 deploy/discord-inbound.sh fin off 로 끈다.'
  const r = await notifierFor(notifyBot).notify(Route.ADMIN, htmlContent(msg), NOTIFY_CTX)
  // chat 은 콜백 실패를 삼킨다 — 안 나갔으면 여기서 남긴다
  if (r.sent === 0) console.warn(`[${LABEL}] 4014 강등 알림 미전송 (sent=0/total=${r.total})`)
}

/**
 * 설정이 갖춰졌으면 gateway 를 시작해 돌려준다. 아니면 undefined(로그 1줄 · 텔레그램은 그대로).
 * `notifyBot` 은 IDENTIFY 차단 알림 경로(ADMIN) — Discord 봇 토큰과 무관한 notifier(웹훅 · 텔레그램)로 보낸다.
 */
export function startDiscordInteractions(notifyBot: NotifyBot): Chat | undefined {
  const cfg = discordBotConfig()
  if (!cfg.ready) {
    console.log('[discord-fin] 봇 토큰·채널 미설정 — Discord 버튼 수신 안 함(텔레그램 버튼은 그대로)')
    return undefined
  }
  if (cfg.allowedUserIds.length === 0) {
    console.warn('[discord-fin] DISCORD_ALLOWED_USER_IDS 비어 있음 — 모든 버튼 클릭을 거부한다')
  }
  // 대화 채널 키가 스위치다(설계 K) — 기동 때 비었으면 D-1 그대로(intents 0 · 메시지 0). 채우면 메시지 intents + 4014 강등(F)
  const inbound = discordChatChannelId() !== ''
  console.log(inbound ? INBOUND_ON_LOG : INBOUND_OFF_LOG)
  const chat = createChat({
    token: () => discordBotConfig().token,
    label: LABEL,
    intents: inbound ? MESSAGE_INTENTS : 0,
    ...(inbound ? { fallbackIntents: 0, onIntentsFallback: () => notifyIntentsFallback(notifyBot) } : {}),
    router: discordRouter,
    allowedUserIds: () => discordBotConfig().allowedUserIds,
    allowedChannelIds: buttonChannels,
    messageChannelIds: messageChannels,
    identifyGuard: createIdentifyGuard({
      store: fileGuardStore(path.resolve(IDENTIFY_RECORD)),
      onBlocked: async (info) => {
        const msg =
          `⚠️ <b>fin Discord 봇 접속 중단</b>\nIDENTIFY 보호(${info.reason} · 24시간 ${info.count}/${info.limit}) — ` +
          `${new Date(info.retryAt).toISOString()} 이후 다시 시도한다. 재시작 루프가 있는지 확인한다.`
        console.error(`[${LABEL}] IDENTIFY 보호 — ${info.reason} · ${info.count}/${info.limit}`)
        const r = await notifierFor(notifyBot).notify(Route.ADMIN, htmlContent(msg), NOTIFY_CTX)
        // chat 의 guard 는 onBlocked 의 실패를 삼킨다 — 안 나갔으면 여기서 남긴다
        if (r.sent === 0) console.warn(`[${LABEL}] IDENTIFY 차단 알림 미전송 (sent=0/total=${r.total})`)
      },
    }),
  })
  chat.start()
  return chat
}
