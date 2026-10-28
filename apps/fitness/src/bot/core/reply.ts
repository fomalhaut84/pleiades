// pleiades 009 D-2 PR-2 (pleiades#364 · 설계 H2): 봇 판단 함수의 중립 응답 모델.
// 판단 함수(decide*)는 플랫폼을 모른다 — 본문 · 형식 · 버튼(라벨 · action)만 정하고, 텔레그램 어댑터(`../telegram-reply`)와
// Discord 어댑터(PR-3 · chat `reply({ format, buttons })`)가 이 모델을 그대로 옮긴다.
// 버튼 action 은 텔레그램 callback data 와 같은 문자열(`food:` · `auto_adjust:` 접두 — Discord custom_id 한도 100자 안).

/** 본문 형식 — `html` 은 텔레그램 HTML 부분집합(<b> <i> <code>) · `plain` 은 그대로. */
export type ReplyFormat = "html" | "plain";

/** 인라인 버튼 하나 — 누르면 `action` 이 같은 판단 함수(decideFoodButton 등)로 돌아온다. */
export interface ReplyButton {
  readonly label: string;
  readonly action: string;
}

/** 보낼 메시지 하나. */
export interface BotReply {
  readonly text: string;
  readonly format: ReplyFormat;
  /** 버튼 행들 — 없으면 버튼 없음. */
  readonly buttons?: readonly (readonly ReplyButton[])[];
  /**
   * 편집 흐름 종료 표시 — 텔레그램은 reply 키보드 슬롯을 비운다(`remove_keyboard` · 옛 force_reply 잔여 정리 · #350).
   * 개념이 없는 플랫폼(Discord)은 무시한다. `buttons` 와 함께 쓰지 않는다.
   */
  readonly clearKeyboard?: boolean;
  /** 길 수 있는 본문(AI 답 · 리포트) — 텔레그램은 4096 분할 + HTML 실패 시 plain 재전송(replyLong) · Discord 는 chat 분할. `buttons`·`clearKeyboard` 와 함께 쓰지 않는다(텔레그램 어댑터가 무시한다 · PR-2 사전 리뷰 info 3). */
  readonly long?: boolean;
}

/** 메시지 응답 출력 — 판단 함수가 순서대로 부른다(진행 안내 → 결과처럼 한 요청에 여러 메시지). */
export interface ReplyOutput {
  reply(message: BotReply): Promise<void>;
  /** 입력 중 표시. 실패는 호출부가 삼킨다(표시용). */
  typing(): Promise<void>;
}

/** 버튼 응답 출력 — 누른 사람에게 짧은 안내 · 그 메시지의 버튼 제거 · 새 메시지. */
export interface ButtonOutput extends ReplyOutput {
  /** 버튼 응답 — `text` 없으면 표시 없이 응답만(텔레그램 answerCallbackQuery()). */
  notice(text?: string): Promise<void>;
  /** 누른 메시지의 버튼을 지운다. */
  removeButtons(): Promise<void>;
}

export function plainReply(text: string, extra: Omit<BotReply, "text" | "format"> = {}): BotReply {
  return { text, format: "plain", ...extra };
}

export function htmlReply(text: string, extra: Omit<BotReply, "text" | "format"> = {}): BotReply {
  return { text, format: "html", ...extra };
}
