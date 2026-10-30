/**
 * pleiades 009 D-3 PR-3 (pleiades#398 · 설계 `_workspace/009/d3/02_writer_d3_r3.md` §4 H2 · B · P · D): 중립 응답 모델(`../core/reply`) → `@pleiades/chat`.
 *
 * 텔레그램 어댑터(`../utils/telegram-reply`)의 Discord 짝 — grammY 를 끌고 오지 않는다. fit `discord/reply.ts` 를 본떴다(앱 사이 import 없음).
 *   reply     → `ctx.reply({ text, format, buttons })`(html 변환 · 2000자 분할 · 버튼은 마지막 조각 = chat) · 키 = 마지막 조각의 메시지
 *   replyLong → 같은 `reply`(html · 분할은 chat — 텔레그램 plain 재전송 분기는 옮기지 않는다)
 *   replyFile → `ctx.replyFile` · 10 MiB 초과는 보내기 전에 정적 안내(chat 이 던지기 전 · 설계 D)
 *   typing    → `ctx.typing()` · 주기 9 s(Discord 표시 약 10 s · 설계 Q)
 * 버튼: toast 는 모았다가 그 결정에서 본문 교체(`edit`)가 한 번도 없었을 때만 본인 전용 안내로(설계 B 토스트 규칙) ·
 *       removeButtons → `setButtons([])` · edit → `ButtonContext.edit`(버튼을 안 주면 지운다).
 * 버튼 행: 텔레그램 키보드(2열)를 그대로 받고, Discord 한도(행 5 · 행당 5)를 넘으면 마지막 행을 두고 나머지를 행당 5 로 다시 묶는다(설계 B N18).
 *          그래도 넘으면 버튼 대신 정적 안내(무표시 0).
 * 안내문 표기: 영어 명령 `/name` → `!name` · 한글 명령 `/알림설정` → `알림설정`(Discord 입력창이 `/` 를 가로챈다 · 설계 P N20).
 *          모델 출력(`verbatim`)은 바꾸지 않는다.
 */

import type { Button, ButtonContext, ButtonRows, MessageContext, OutgoingMessage } from '@pleiades/chat'
import type { BotReply, ButtonOutput, ButtonPress, ReplyButtonRows, ReplyOutput, Requester } from '../core/reply'
import { discordMessageKey } from '../core/state-key'

/** Discord 명령 접두 — 입력창이 `/` 를 앱 명령 검색으로 가로챈다(009 D-2 X-1 실측). */
export const DISCORD_COMMAND_PREFIX = '!'

/** 텔레그램 영어 명령 21 — 안내문에서 `!` 로 바꿔 보인다. 등록(`router.ts`)과 같은 목록. */
export const ENGLISH_COMMANDS = [
  'start', 'help', 'ai', 'reset', 'alertconfig',
  'strategy', 'strategylist', 'customstrategy', 'customstrategylist', 'customstrategydelete',
  'watch', 'unwatch', 'watchlist', 'analysis', 'briefing',
  'networth', 'assetlist', 'assetadd', 'assetupdate', 'report', 'backtest',
] as const

/** 한글 명령 이름(정규식 28 의 이름 · `수입` 은 둘이 같은 이름) — 안내문의 `/이름` 에서 슬래시를 뗀다. */
const KOREAN_COMMANDS = [
  '현황', '계좌', '주가', '환율', '매수', '매도', '수입', '소비', '예산', '예산설정', '알림설정',
  '전략', '전략목록', '커스텀전략등록', '커스텀전략목록', '커스텀전략삭제',
  '관심', '관심삭제', '관심목록', '분석', '브리핑', '순자산', '자산목록', '자산추가', '자산수정', '리포트', '백테스트',
]

const BOUNDARY = `(^|[\\s('"“])`
const ENGLISH_RE = new RegExp(`${BOUNDARY}/(${ENGLISH_COMMANDS.join('|')})(?![\\w/])`, 'gm')
// 긴 이름 먼저 — `/관심삭제` 가 `관심` 에서 끊기지 않게. 뒤에 한글·영숫자가 이어지면 다른 낱말이다(`/매수구간` 은 그대로)
const KOREAN_RE = new RegExp(
  `${BOUNDARY}/(${[...KOREAN_COMMANDS].sort((a, b) => b.length - a.length).join('|')})(?![가-힣\\w/])`,
  'gm',
)

/** 안내문의 명령 표기를 Discord 로 — 줄 처음 · 공백 · 여는 괄호·따옴표 뒤만(URL 경로 `…/report` · `매수/매도` 는 그대로). */
export function toDiscordCommandText(text: string): string {
  return text.replace(ENGLISH_RE, `$1${DISCORD_COMMAND_PREFIX}$2`).replace(KOREAN_RE, '$1$2')
}

const DISCORD_MAX_ROWS = 5
const DISCORD_ROW_WIDTH = 5

/**
 * 버튼 행 → Discord 행. 빈 행은 버린다(텔레그램 키보드 끝의 빈 행).
 * 한도 안이면 그대로 · 넘으면 마지막 행(취소 · 전체 카테고리)을 두고 앞의 버튼을 행당 5 로 다시 묶는다 — 용량 = 4 행 × 5.
 * 그래도 넘으면 undefined(호출부가 정적 안내로 바꾼다).
 */
export function toDiscordButtonRows(rows: ReplyButtonRows): ButtonRows | undefined {
  const toButton = (b: { label: string; action: string }): Button => ({ label: b.label, action: b.action })
  const filled = rows.filter((row) => row.length > 0).map((row) => row.map(toButton))
  if (filled.length <= DISCORD_MAX_ROWS && filled.every((row) => row.length <= DISCORD_ROW_WIDTH)) return filled
  const last = filled[filled.length - 1]
  const rest = filled.slice(0, -1).flat()
  const packed: Button[][] = []
  for (let i = 0; i < rest.length; i += DISCORD_ROW_WIDTH) packed.push(rest.slice(i, i + DISCORD_ROW_WIDTH))
  if (packed.length + 1 > DISCORD_MAX_ROWS || last.length > DISCORD_ROW_WIDTH) return undefined
  return [...packed, last]
}

/** 버튼이 Discord 한도를 넘어 보일 수 없을 때 — 그 기록은 진행되지 않는다(대기 상태는 TTL 로 사라진다 · 설계 B D3-R4). */
export const TOO_MANY_BUTTONS_TEXT = '⚠️ 선택지가 많아 버튼으로 보일 수 없습니다. 웹에서 기록해주세요.'

/** 응답 모델 → chat 메시지. */
export function toOutgoing(message: BotReply): OutgoingMessage {
  const text = message.verbatim ? message.text : toDiscordCommandText(message.text)
  if (message.buttons === undefined) return { text, format: message.format }
  const buttons = toDiscordButtonRows(message.buttons)
  if (buttons === undefined) return { text: TOO_MANY_BUTTONS_TEXT, format: 'plain' }
  return { text, format: message.format, buttons }
}

/** chat 보내는 파일 상한과 같다(`packages/chat` rest 기본 10 MiB). */
export const DISCORD_MAX_FILE_BYTES = 10 * 1024 * 1024
export const FILE_TOO_LARGE_TEXT = '⚠️ 파일이 커서 보낼 수 없습니다. 웹에서 확인해주세요.'

/** Discord "입력 중" 은 약 10초 지속 — 그 전에 다시 부른다. */
export const DISCORD_TYPING_INTERVAL_MS = 9_000

export function discordOutput(ctx: Pick<MessageContext, 'reply' | 'replyFile' | 'typing'>): ReplyOutput {
  return {
    reply: async (message) => {
      const sent = await ctx.reply(toOutgoing(message))
      return discordMessageKey(sent.channelId, sent.id)
    },
    replyLong: async (html) => {
      await ctx.reply({ text: toDiscordCommandText(html), format: 'html' })
    },
    replyFile: async (file) => {
      if (file.data.byteLength > DISCORD_MAX_FILE_BYTES) {
        await ctx.reply(FILE_TOO_LARGE_TEXT)
        return
      }
      await ctx.replyFile({
        name: file.name,
        data: file.data,
        contentType: file.contentType,
        ...(file.caption === undefined ? {} : { caption: file.caption }),
      })
    },
    // chat 이 실패를 삼키고 경고 1줄을 남긴다
    typing: () => ctx.typing(),
    typingIntervalMs: DISCORD_TYPING_INTERVAL_MS,
  }
}

/** 버튼 한 번의 출력 — 판단이 끝나면 `finish()` 로 모아 둔 토스트를 처리한다. */
export interface DiscordButtonSession {
  readonly out: ButtonOutput
  finish(): Promise<void>
}

export function discordButtonSession(ctx: Pick<ButtonContext, 'edit' | 'setButtons' | 'notice'>): DiscordButtonSession {
  let toast: string | undefined
  let edited = false
  return {
    out: {
      toast: async (text) => {
        if (text !== undefined) toast = text
      },
      removeButtons: () => ctx.setButtons([]),
      edit: async (message) => {
        await ctx.edit(toOutgoing(message))
        // 성공한 뒤에만 — 기록 뒤 본문 교체가 실패하면(afterCommit 이 삼킨다) 토스트가 유일한 결과 표시다(9-1 리뷰 major)
        edited = true
      },
    },
    // 본문을 바꾼 결정이면 토스트는 버린다(본문이 결과다) · 아니면 본인 전용 안내 1(만료 · 본인 아님 · 중복 클릭)
    finish: async () => {
      if (!edited && toast !== undefined) await ctx.notice(toast)
    },
  }
}

/** 요청자 — 본인 확인 = Discord 사용자 ID · DB `Transaction.userId` = `discord:<id>`(UQ-2 · 텔레그램 행과 출처가 갈린다). */
export function discordRequester(ctx: Pick<MessageContext, 'userId'>): Requester {
  return { userId: ctx.userId, dbUserId: `discord:${ctx.userId}` }
}

/** 눌린 버튼 — 메시지 키(`discord:<채널>:<메시지>`) · 누른 사람. */
export function discordButtonPress(ctx: Pick<ButtonContext, 'channelId' | 'messageId' | 'userId'>): ButtonPress {
  return { messageKey: discordMessageKey(ctx.channelId, ctx.messageId), clickerId: ctx.userId }
}
