/**
 * pleiades 009 D-3 PR-1a (pleiades#382 · 설계 `_workspace/009/d3/02_writer_d3_r3.md` §4 H2 · B): 봇 판단 함수의 중립 응답 모델.
 *
 * 판단 함수(decide*)는 플랫폼을 모른다 — 본문 · 형식 · 버튼(라벨 · action)과 **부르는 순서**만 정한다.
 * 텔레그램 어댑터(`../utils/telegram-reply`)는 단계마다 지금과 같은 grammY 호출 하나를 낸다(호출열 동등 — 특성 테스트가 고정).
 * Discord 어댑터(PR-3 · chat)는 같은 단계를 chat 호출로 옮긴다. fit `core/reply.ts` 를 본뗬고 버튼 출력에 `edit`(본문·버튼 교체)이 더 있다
 * (앱 사이 import 는 하지 않는다).
 * 버튼 action 은 텔레그램 callback data 와 같은 문자열(`tx:` · `multi:` · `trade:` 접두 — Discord custom_id 한도 100자 안 · 설계 B).
 */

/** 본문 형식 — `html` 은 텔레그램 HTML 부분집합(<b> <i> <code>) · `plain` 은 그대로. */
export type ReplyFormat = 'html' | 'plain'

/** 인라인 버튼 하나 — 누르면 `action` 이 같은 판단 함수로 돌아온다. */
export interface ReplyButton {
  readonly label: string
  readonly action: string
}

/**
 * 버튼 행들. **빈 행이 있을 수 있다** — 텔레그램 키보드 모양을 그대로 옮긴 것이다(히스토리 추천 키보드 끝의 빈 행 · 특성 테스트 T4).
 * 빈 행을 표현할 수 없는 플랫폼(Discord)의 어댑터가 버린다.
 */
export type ReplyButtonRows = readonly (readonly ReplyButton[])[]

/** 보낼(또는 바꿀) 메시지 하나. */
export interface BotReply {
  readonly text: string
  readonly format: ReplyFormat
  /** 없으면 버튼 없음. */
  readonly buttons?: ReplyButtonRows
}

/**
 * 보낸 메시지의 키 — 플랫폼 접두가 붙어 있다(`../core/state-key` `telegramMessageKey` · `discordMessageKey`).
 * 버튼 대기 상태(pending)가 이 키 + 요청 id 에 묶인다(설계 S — 플랫폼 사이 충돌이 구조상 0).
 */
export type MessageKey = string

/**
 * 첨부 파일 하나 — 분기 리포트 PDF(`/report`). pleiades 009 D-3 PR-2b (pleiades#394 · 설계 §4 D).
 * 텔레그램 = `replyWithDocument(InputFile, {caption})` · Discord = chat `replyFile`(10 MiB 상한 · PR-3).
 */
export interface ReplyFile {
  readonly name: string
  readonly data: Uint8Array
  readonly contentType: string
  readonly caption?: string
}

/** 메시지 응답 출력 — 판단 함수가 순서대로 부른다(진행 안내 → 결과처럼 한 요청에 여러 메시지). */
export interface ReplyOutput {
  /** 보내고 그 메시지의 키를 돌려준다. 실패는 던진다. */
  reply(message: BotReply): Promise<MessageKey>
  /**
   * HTML 본문 — 길 수 있다(조회 결과 · 목록). 텔레그램은 지금의 `replyHtml`(4096 분할 · 네트워크 재시도 · HTML 파싱 실패 시
   * 태그를 뗀 plain 재전송) · Discord 는 chat 이 변환·분할한다(PR-3). 버튼을 달지 않으므로 메시지 키를 돌려주지 않는다.
   * pleiades 009 D-3 PR-2a (pleiades#392) — fit `BotReply.long` 과 같은 뜻을 메서드로 둔다(`reply` 가 키를 돌려주는 계약 유지).
   */
  replyLong(html: string): Promise<void>
  /** 파일 하나를 보낸다(캡션 선택). 실패는 던진다. */
  replyFile(file: ReplyFile): Promise<void>
  /** 입력 중 표시 한 번. 실패는 호출부가 삼킨다(표시용). */
  typing(): Promise<void>
  /** 긴 작업이 `typing` 을 다시 부르는 주기 — 텔레그램 5 s(지금 값) · Discord 는 어댑터 값(설계 Q). */
  readonly typingIntervalMs: number
}

/**
 * 버튼 응답 출력 — 단계 열. 판단 함수는 **지금 핸들러가 부르던 순서 그대로** 부른다
 * (`tx:cancel` = toast → removeButtons → edit · 설계 B 응답 모델).
 */
export interface ButtonOutput {
  /** 누른 사람에게 짧은 안내 — `text` 없으면 표시 없이 응답만(텔레그램 `answerCallbackQuery()`). */
  toast(text?: string): Promise<void>
  /** 누른 메시지의 버튼을 지운다. */
  removeButtons(): Promise<void>
  /** 누른 메시지의 본문을 바꾼다 — `buttons` 가 있으면 버튼도 그것으로 바꾼다(없으면 텔레그램은 키보드를 건드리지 않는다). */
  edit(message: BotReply): Promise<void>
}

/** 요청한 사람 — 본인 확인 값과 DB 표기 값. */
export interface Requester {
  /** 버튼 본인 확인에 쓰는 ID(텔레그램 `String(from.id ?? 0)` · Discord 사용자 ID). */
  readonly userId: string
  /** `Transaction.userId` 에 쓰는 값 — 텔레그램은 지금 값 그대로 `"<from.id>"` · Discord 는 `discord:<userId>`(UQ-2 · PR-3). */
  readonly dbUserId: string
}

/** 눌린 버튼 — 어느 메시지의 버튼을 누가 눌렀나. */
export interface ButtonPress {
  /** 누른 메시지의 키 — 메시지를 모르면 undefined. */
  readonly messageKey: MessageKey | undefined
  /** 누른 사람 ID — 모르면 undefined(= 본인 확인 거부). */
  readonly clickerId: string | undefined
}

/**
 * 기록(DB 쓰기) 뒤 화면 갱신 — 단계마다 따로 시도하고 실패는 로그만 남긴다.
 * 앞 단계(예: 콜백 만료로 토스트 실패)가 실패해도 버튼 제거·본문 교체는 돈다 — 기록된 거래가 화면에 남지 않으면
 * 사용자가 결과를 몰라 다시 입력한다(중복 기록). 기록 뒤 실패를 "기록 실패" 로 바꾸지 않는다.
 * pleiades 009 D-3 PR-2c (pleiades#396 · UQ-3 · 9-1 리뷰 major).
 */
export async function afterCommit(label: string, steps: readonly (() => Promise<void>)[]): Promise<void> {
  for (const step of steps) {
    try {
      await step()
    } catch (error) {
      console.error(`${label} 기록 뒤 원본 수정 실패(기록은 됨):`, error)
    }
  }
}

export function plainReply(text: string, buttons?: ReplyButtonRows): BotReply {
  return buttons ? { text, format: 'plain', buttons } : { text, format: 'plain' }
}

export function htmlReply(text: string, buttons?: ReplyButtonRows): BotReply {
  return buttons ? { text, format: 'html', buttons } : { text, format: 'html' }
}

/**
 * 버튼 본인 확인 — 누른 사람 ID 가 없으면 거부한다.
 * 옛 `ctx.from?.id !== pending.requestedByUserId`(number) 가 `undefined !== 0` 으로 거부하던 것과 같다 —
 * 비교 쪽에 `?? 0` 기본값을 넣으면 `"0" === "0"` 으로 허용이 된다(설계 S · 감사 [A]#2 · 특성 테스트 T17).
 */
export function isSameRequester(clickerId: string | undefined, requestedByUserId: string): boolean {
  return clickerId !== undefined && clickerId === requestedByUserId
}
