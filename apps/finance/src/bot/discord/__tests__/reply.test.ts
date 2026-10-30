/**
 * pleiades 009 D-3 PR-3 (pleiades#398) — Discord 어댑터(설계 §4 P N20 · B · D · S).
 * 안내문 표기 · 버튼 행 재배치(N18 · 용량 20) · 파일 상한 · 토스트 규칙 · 요청자/누른 사람 값.
 */

import { describe, expect, it, vi } from 'vitest'
import type { ReplyButton } from '../../core/reply'
import {
  DISCORD_MAX_FILE_BYTES,
  ENGLISH_COMMANDS,
  FILE_TOO_LARGE_TEXT,
  TOO_MANY_BUTTONS_TEXT,
  discordButtonPress,
  discordButtonSession,
  discordOutput,
  discordRequester,
  toDiscordButtonRows,
  toDiscordCommandText,
  toOutgoing,
} from '../reply'

const sent = { id: 'm9', channelId: 'c1', edit: vi.fn(), setButtons: vi.fn(), delete: vi.fn() }
function messageCtx() {
  return {
    reply: vi.fn(async () => sent),
    replyFile: vi.fn(async () => sent),
    typing: vi.fn(async () => undefined),
  }
}
function buttonCtx() {
  return { edit: vi.fn(async () => {}), setButtons: vi.fn(async () => {}), notice: vi.fn(async () => {}) }
}
const cats = (n: number): ReplyButton[][] => {
  const rows: ReplyButton[][] = []
  for (let i = 0; i < n; i += 2) {
    rows.push(Array.from({ length: Math.min(2, n - i) }, (_, k) => ({ label: `c${i + k}`, action: `tx:cat:t:${i + k}` })))
  }
  return rows
}
const cancel = [{ label: '❌ 취소', action: 'tx:cancel:t' }]

describe('안내문 표기 (P N20)', () => {
  it.each([
    ['사용법: /analysis [종목]', '사용법: !analysis [종목]'],
    ['/ai 에서 직접 질문해주세요.', '!ai 에서 직접 질문해주세요.'],
    ['(/strategylist)', '(!strategylist)'],
    ['변경: /알림설정 [항목] [값]', '변경: 알림설정 [항목] [값]'],
    ['/관심삭제 SOFI · /관심목록', '관심삭제 SOFI · 관심목록'],
    ['예: /전략 NVDA', '예: 전략 NVDA'],
  ])('%s', (text, want) => expect(toDiscordCommandText(text)).toBe(want))

  it.each([
    'https://x.test/report', '매수/매도', '/매수구간', '/reports', '/strategy/x', 'a/ai',
  ])('바꾸지 않는다: %s', (text) => expect(toDiscordCommandText(text)).toBe(text))

  it('여러 줄 — 줄마다 처음을 본다', () => {
    expect(toDiscordCommandText('a\n/help\n/현황')).toBe('a\n!help\n현황')
  })

  it('영어 명령 21', () => expect(ENGLISH_COMMANDS).toHaveLength(21))

  it('모델 출력(verbatim)은 그대로 · 일반 응답은 바꾼다', () => {
    expect(toOutgoing({ text: '/ai 써', format: 'plain', verbatim: true }).text).toBe('/ai 써')
    expect(toOutgoing({ text: '/ai 써', format: 'plain' }).text).toBe('!ai 써')
  })
})

describe('버튼 행 재배치 (B N18)', () => {
  it('한도 안 — 그대로 · 빈 행은 버린다', () => {
    const rows = [...cats(4), cancel, []]
    expect(toDiscordButtonRows(rows)?.map((r) => r.length)).toEqual([2, 2, 1])
  })

  it('카테고리 9 → 5 + 4 + 취소 = 3 행', () => {
    expect(toDiscordButtonRows([...cats(9), cancel])?.map((r) => r.length)).toEqual([5, 4, 1])
  })

  it('히스토리 경로 — 마지막 행(취소 · 전체 카테고리) 2 버튼 유지', () => {
    const last = [...cancel, { label: '📋 전체 카테고리', action: 'tx:allcat:t' }]
    const out = toDiscordButtonRows([...cats(10), last, []])
    expect(out?.map((r) => r.length)).toEqual([5, 5, 2])
    expect(out?.[2].map((b) => b.action)).toEqual(['tx:cancel:t', 'tx:allcat:t'])
  })

  it('카테고리 20 = 용량 · 21 → 담을 수 없다', () => {
    expect(toDiscordButtonRows([...cats(20), cancel])?.map((r) => r.length)).toEqual([5, 5, 5, 5, 1])
    expect(toDiscordButtonRows([...cats(21), cancel])).toBeUndefined()
  })

  it('담을 수 없으면 버튼 없는 정적 안내(무표시 0)', () => {
    expect(toOutgoing({ text: '카테고리를 선택해주세요:', format: 'plain', buttons: [...cats(21), cancel] })).toEqual({
      text: TOO_MANY_BUTTONS_TEXT,
      format: 'plain',
    })
  })
})

describe('메시지 출력', () => {
  it('reply → 메시지 키 discord:<채널>:<메시지> · 버튼은 chat 모양', async () => {
    const c = messageCtx()
    const key = await discordOutput(c).reply({ text: 'x', format: 'html', buttons: [cancel] })
    expect(key).toBe('discord:c1:m9')
    expect(c.reply).toHaveBeenCalledWith({ text: 'x', format: 'html', buttons: [[{ label: '❌ 취소', action: 'tx:cancel:t' }]] })
  })

  it('replyLong → html · 명령 표기 변환', async () => {
    const c = messageCtx()
    await discordOutput(c).replyLong('<b>도움말</b>\n/help')
    expect(c.reply).toHaveBeenCalledWith({ text: '<b>도움말</b>\n!help', format: 'html' })
  })

  it('replyFile — 상한 안이면 그대로(캡션 선택) · 넘으면 보내기 전에 정적 안내 (D)', async () => {
    const c = messageCtx()
    const out = discordOutput(c)
    const data = new Uint8Array(3)
    await out.replyFile({ name: 'q.pdf', data, contentType: 'application/pdf', caption: '📊' })
    await out.replyFile({ name: 'r.pdf', data, contentType: 'application/pdf' })
    expect(c.replyFile.mock.calls).toEqual([
      [{ name: 'q.pdf', data, contentType: 'application/pdf', caption: '📊' }],
      [{ name: 'r.pdf', data, contentType: 'application/pdf' }],
    ])
    await out.replyFile({ name: 'big.pdf', data: new Uint8Array(DISCORD_MAX_FILE_BYTES + 1), contentType: 'application/pdf' })
    expect(c.replyFile).toHaveBeenCalledTimes(2)
    expect(c.reply).toHaveBeenCalledWith(FILE_TOO_LARGE_TEXT)
  })

  it('typing 주기 9 s', () => expect(discordOutput(messageCtx()).typingIntervalMs).toBe(9_000))
})

describe('버튼 출력 — 토스트 규칙 (B)', () => {
  it('본문을 바꾼 결정 → 안내 0 (취소: toast → removeButtons → edit)', async () => {
    const c = buttonCtx()
    const s = discordButtonSession(c)
    await s.out.toast('취소됨')
    await s.out.removeButtons()
    await s.out.edit({ text: '🚫 취소되었습니다.', format: 'plain' })
    await s.finish()
    expect(c.setButtons).toHaveBeenCalledWith([])
    expect(c.edit).toHaveBeenCalledWith({ text: '🚫 취소되었습니다.', format: 'plain' })
    expect(c.notice).not.toHaveBeenCalled()
  })

  it('본문을 안 바꾼 결정(만료 · 본인 아님) → 본인 안내 1 · 텍스트 없는 toast 는 표시 0', async () => {
    const c = buttonCtx()
    const s = discordButtonSession(c)
    await s.out.toast('⏰ 만료된 요청입니다.')
    await s.finish()
    expect(c.notice).toHaveBeenCalledWith('⏰ 만료된 요청입니다.')
    const c2 = buttonCtx()
    const s2 = discordButtonSession(c2)
    await s2.out.toast()
    await s2.finish()
    expect(c2.notice).not.toHaveBeenCalled()
  })

  it('edit 에 버튼 — 재배치를 탄다', async () => {
    const c = buttonCtx()
    await discordButtonSession(c).out.edit({ text: 't', format: 'plain', buttons: [...cats(9), cancel] })
    const arg = (c.edit.mock.calls[0] as unknown[])[0] as { buttons: unknown[][] }
    expect(arg.buttons.map((r) => r.length)).toEqual([5, 4, 1])
  })
})

describe('식별자 (S · UQ-2)', () => {
  it('요청자 — 본인 확인 = 사용자 ID · DB = discord:<id>', () => {
    expect(discordRequester({ userId: '42' })).toEqual({ userId: '42', dbUserId: 'discord:42' })
  })

  it('누른 사람 — 메시지 키 · 사용자 ID', () => {
    expect(discordButtonPress({ channelId: 'c', messageId: 'm', userId: 'u' })).toEqual({
      messageKey: 'discord:c:m',
      clickerId: 'u',
    })
  })
})
