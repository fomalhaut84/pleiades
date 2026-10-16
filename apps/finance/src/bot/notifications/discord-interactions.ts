/**
 * pleiades M-6b-4 (pleiades#155 · 003 §6 1b-2b): Discord 버튼 클릭을 받는 gateway — 봇 프로세스에서 텔레그램 롱폴링과 함께 돈다.
 * 토큰·채널이 설정돼 있으면 스위치(NOTIFY_INTERACTIVE_CHANNEL)와 무관하게 접속한다 — 스위치를 나중에 켜도(루트 .env)
 * 재시작 없이 버튼이 동작하게. 허용 = DISCORD_ALLOWED_USER_IDS AND 그 채널(#147 결정). 판단은 텔레그램과 같은 decideVest.
 *
 * Discord 3초 응답 제한은 패키지 gateway 가 처리한다 — 클릭 즉시 DEFERRED_UPDATE_MESSAGE 후 종가 조회·트랜잭션을 기다려
 * 원본을 수정한다(interaction 토큰 유효 15분).
 */

import { createDiscordGateway, type DiscordButtonContext, type DiscordGateway } from '@pleiades/notify'
import { decideVest } from '@/bot/commands/vest-confirm'
import { escapeHtml } from '@/bot/utils/telegram'
import { sanitizeError } from '@/bot/utils/error'
import { discordBotConfig } from './notifier'

/** 버튼 1건 처리 — `vest:` 만 다룬다. 다른 접두사는 안내만. */
export async function handleDiscordButton(ctx: DiscordButtonContext): Promise<void> {
  if (!ctx.customId.startsWith('vest:')) {
    await ctx.reply('알 수 없는 요청입니다.')
    return
  }
  const decision = await decideVest(ctx.customId)
  if (decision.kind === 'alert') {
    // 원본·버튼은 그대로 — 다시 누를 수 있다(텔레그램 show_alert 와 같다)
    await ctx.reply(decision.text)
    return
  }
  // 확정이면 vest 는 이미 DB 반영됐다 — 원본 수정이 실패해도 throw 하지 않는다(gateway 의 "처리 중 오류" 안내가 거짓이 된다).
  // 본문은 plain 이라 escape 해 넘긴다(edit 는 HTML 을 Discord md 로 바꾼다).
  try {
    await ctx.edit(escapeHtml(decision.text))
  } catch (err) {
    console.warn(`[discord-fin] 원본 수정 실패 (${decision.toast}) — 본인 안내로 대신: ${sanitizeError(err)}`)
    await ctx.reply(decision.text).catch((e: unknown) => {
      console.warn(`[discord-fin] 안내 전송 실패 (무시): ${sanitizeError(e)}`)
    })
  }
}

/** 설정이 갖춰졌으면 gateway 를 시작해 돌려준다. 아니면 undefined(로그 1줄 · 텔레그램은 그대로). */
export function startDiscordInteractions(): DiscordGateway | undefined {
  const cfg = discordBotConfig()
  if (!cfg.ready) {
    console.log('[discord-fin] 봇 토큰·채널 미설정 — Discord 버튼 수신 안 함(텔레그램 버튼은 그대로)')
    return undefined
  }
  if (cfg.allowedUserIds.length === 0) {
    console.warn('[discord-fin] DISCORD_ALLOWED_USER_IDS 비어 있음 — 모든 버튼 클릭을 거부한다')
  }
  const gateway = createDiscordGateway({
    token: cfg.token,
    label: 'discord-fin',
    onButton: handleDiscordButton,
    allowedUserIds: () => discordBotConfig().allowedUserIds,
    allowedChannelIds: () => [discordBotConfig().channelId],
  })
  gateway.start()
  return gateway
}
