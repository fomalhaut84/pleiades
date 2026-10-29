/**
 * pleiades 009 D-3 PR-1a (pleiades#382 · 설계 §4 S): 봇 상태의 키.
 *
 * 대화 상태(AI 세션 · 동시 1건 — PR-1b)는 fit 과 같은 모양: 텔레그램 chat 단위 · Discord 는 채널 + 사용자 단위
 * (허용 사용자가 여럿일 수 있다). 버튼 대기 상태(pending)는 봇이 보낸 메시지에 묶인다 — 메시지 키 + 요청 id.
 * 플랫폼 접두가 있어 같은 숫자의 텔레그램 id 와 Discord id 가 서로의 상태를 소비하지 않는다(2-2 · 구조상 0).
 * fit `core/state-key.ts` 와 같은 함수를 fin 에 따로 둔다(앱 사이 import 는 하지 않는다).
 */

import type { MessageKey } from './reply'

/** 대화 상태 키 — `telegram:<chatId>` 또는 `discord:<channelId>:<userId>`. */
export type StateKey = string

export function telegramStateKey(chatId: number): StateKey {
  return `telegram:${chatId}`
}

export function discordStateKey(channelId: string, userId: string): StateKey {
  return `discord:${channelId}:${userId}`
}

/** 텔레그램 메시지 키 — `telegram:<chatId>:<messageId>`. */
export function telegramMessageKey(chatId: number, messageId: number): MessageKey {
  return `telegram:${chatId}:${messageId}`
}

/** Discord 메시지 키 — `discord:<channelId>:<messageId>`(chat `SentMessage{channelId,id}` ↔ `ButtonContext{channelId,messageId}` 짝). */
export function discordMessageKey(channelId: string, messageId: string): MessageKey {
  return `discord:${channelId}:${messageId}`
}

/** 버튼 대기 상태 키 — 메시지 키 + 요청 id(txId · tradeId). */
export function pendingKey(messageKey: MessageKey, requestId: string): string {
  return `${messageKey}:${requestId}`
}
