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
 */

import path from 'node:path'
import { createChat, createIdentifyGuard, createRouter, fileGuardStore, type ButtonContext, type Chat } from '@pleiades/chat'
import { decideVest } from '@/bot/commands/vest-confirm'
import { sanitizeError } from '@/bot/utils/error'
import { discordBotConfig, htmlContent, notifierFor, NOTIFY_CTX, Route, type NotifyBot } from './notifier'

const LABEL = 'discord-fin'
/** cwd 상대 — pm2·run.sh 모두 apps/finance 에서 띄운다(deploy/pleiades.config.cjs). */
export const IDENTIFY_RECORD = path.join('logs', 'identify-fin.json')

/** 버튼 1건 처리 — `vest:` 만 다룬다. 다른 접두사는 안내만. */
export async function handleDiscordButton(ctx: ButtonContext): Promise<void> {
  if (!ctx.action.startsWith('vest:')) {
    await ctx.notice('알 수 없는 요청입니다.')
    return
  }
  const decision = await decideVest(ctx.action)
  if (decision.kind === 'alert') {
    // 원본·버튼은 그대로 — 다시 누를 수 있다(텔레그램 show_alert 와 같다)
    await ctx.notice(decision.text)
    return
  }
  // 확정이면 vest 는 이미 DB 반영됐다 — 원본 수정이 실패해도 throw 하지 않는다(chat 의 "처리 중 오류" 안내가 거짓이 된다).
  // 본문은 plain 그대로(chat 의 문자열 = plain) · 버튼은 지운다(edit 기본).
  try {
    await ctx.edit(decision.text)
  } catch (err) {
    console.warn(`[discord-fin] 원본 수정 실패 (${decision.toast}) — 본인 안내로 대신: ${sanitizeError(err)}`)
    await ctx.notice(decision.text).catch((e: unknown) => {
      console.warn(`[discord-fin] 안내 전송 실패 (무시): ${sanitizeError(e)}`)
    })
  }
}

/** 모든 버튼을 handleDiscordButton 으로 — 접두사 판단은 핸들러가 한다(알 수 없는 접두사도 안내). */
export const discordRouter = createRouter().action(/^/, (ctx) => handleDiscordButton(ctx))

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
  const chat = createChat({
    token: () => discordBotConfig().token,
    label: LABEL,
    intents: 0,
    router: discordRouter,
    allowedUserIds: () => discordBotConfig().allowedUserIds,
    allowedChannelIds: () => [discordBotConfig().channelId],
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
