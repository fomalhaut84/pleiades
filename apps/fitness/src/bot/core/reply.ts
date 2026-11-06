// pleiades 009 D-2 PR-2 (pleiades#364 · 설계 H2): 봇 판단 함수의 중립 응답 모델.
// 판단 함수(decide*)는 플랫폼을 모른다 — 본문 · 형식 · 버튼(라벨 · action)만 정하고,
// Discord 어댑터(PR-3 · chat `reply({ format, buttons })`)가 이 모델을 그대로 옮긴다.
// 버튼 action 은 옛 메시지와 같은 문자열(`food:` · `auto_adjust:` 접두 — Discord custom_id 한도 100자 안).

/** 본문 형식 — `html` 은 HTML 부분집합(<b> <i> <code> · chat 이 Discord 마크다운으로 바꾼다) · `plain` 은 그대로. */
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
  /** 길 수 있는 본문(AI 답 · 리포트) — chat 이 분할하고 명령 표기(`/`→`!`)를 바꾸지 않는다. `buttons` 와 함께 쓰지 않는다. */
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
  /** 버튼 응답 — `text` 없으면 표시 없이 응답만(chat 이 이미 지연 응답했다). */
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
