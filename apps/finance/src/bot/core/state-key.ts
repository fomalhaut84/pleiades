/**
 * pleiades 009 D-3 PR-1a (pleiades#382 · 설계 §4 S): 봇 상태의 키.
 *
 * 대화 상태(AI 세션 · 동시 1건 — PR-1b)는 fit 과 같은 모양: Discord 채널 + 사용자 단위
 * (허용 사용자가 여럿일 수 있다). 버튼 대기 상태(pending)는 봇이 보낸 메시지에 묶인다 — 메시지 키 + 요청 id.
 * 플랫폼 접두(`discord:`)가 있어 다른 출처의 같은 숫자 id 와 상태가 섞이지 않는다(2-2 · 구조상 0).
 * fit `core/state-key.ts` 와 같은 함수를 fin 에 따로 둔다(앱 사이 import 는 하지 않는다).
 */

import type { MessageKey } from './reply'

/** 대화 상태 키 — `discord:<channelId>:<userId>`(옛 채널 키는 009 D-5 B3b 에서 지웠다 · pleiades#508). */
export type StateKey = string

export function discordStateKey(channelId: string, userId: string): StateKey {
  return `discord:${channelId}:${userId}`
}

/** Discord 메시지 키 — `discord:<channelId>:<messageId>`(chat `SentMessage{channelId,id}` ↔ `ButtonContext{channelId,messageId}` 짝). */
export function discordMessageKey(channelId: string, messageId: string): MessageKey {
  return `discord:${channelId}:${messageId}`
}

/** 버튼 대기 상태 키 — 메시지 키 + 요청 id(txId · tradeId). */
export function pendingKey(messageKey: MessageKey, requestId: string): string {
  return `${messageKey}:${requestId}`
}
