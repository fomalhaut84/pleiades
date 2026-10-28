// pleiades 009 D-2 PR-3 (pleiades#367 · 설계 H2): 중립 응답 모델(`../core/reply`) → `@pleiades/chat` 컨텍스트.
// 텔레그램 어댑터(`../utils/telegram-reply`)의 Discord 짝 — 그 모듈과 달리 grammY 를 끌고 오지 않는다.
//   format · buttons → `reply({ text, format, buttons })`(html 변환 · 2000자 분할 · 버튼은 마지막 조각 = chat)
//   clearKeyboard → 무시(Discord 에 reply 키보드 개념이 없다) · long → chat 분할에 맡긴다(텔레그램 plain 재전송 분기는 옮기지 않는다)
//   버튼 컨텍스트: notice → 본인 전용 안내(text 없으면 무표시 — chat 이 이미 지연 응답했다) · removeButtons → setButtons([]) · reply → 같은 채널 새 메시지

import type { ButtonContext, MessageContext, OutgoingMessage } from "@pleiades/chat";
import type { BotReply, ButtonOutput, ReplyOutput } from "../core/reply";

/** Discord 명령 접두 — 입력창이 `/` 를 앱 명령 검색으로 가로챈다(X-1 실측 · 사용자 2026-10-28 UQ-3). */
export const DISCORD_COMMAND_PREFIX = "!";

/** 판단 함수가 안내문에 쓰는 텔레그램 명령 이름 — Discord 응답에서는 `!` 로 바꿔 보인다. */
const COMMAND_NAMES = ["start", "help", "today", "run", "sleep", "weight", "sync", "report", "ai", "reset", "food_kcal"];
const SLASH_COMMAND_RE = new RegExp(`(^|[\\s('"“])/(${COMMAND_NAMES.join("|")})(?![\\w/])`, "g");

/**
 * 안내문의 `/today` 같은 명령 표기를 `!today` 로 — 줄 처음 · 공백 · 여는 괄호·따옴표 뒤만(URL 경로 `…/run` 은 그대로).
 * 길 수 있는 본문(AI 답 · 리포트 · `long`)은 바꾸지 않는다 — 모델 출력은 그대로 보인다.
 */
export function toDiscordCommandText(text: string): string {
  return text.replace(SLASH_COMMAND_RE, `$1${DISCORD_COMMAND_PREFIX}$2`);
}

/** 응답 모델 → chat 메시지. */
export function toOutgoing(message: BotReply): OutgoingMessage {
  const text = message.long ? message.text : toDiscordCommandText(message.text);
  const out: OutgoingMessage = { text, format: message.format };
  if (message.buttons && message.buttons.length > 0) {
    return { ...out, buttons: message.buttons.map((row) => row.map((b) => ({ label: b.label, action: b.action }))) };
  }
  return out;
}

export function discordOutput(ctx: Pick<MessageContext, "reply" | "typing">): ReplyOutput {
  return {
    reply: async (message) => {
      await ctx.reply(toOutgoing(message));
    },
    // chat 이 실패를 삼키고 경고 1줄을 남긴다
    typing: () => ctx.typing(),
  };
}

export function discordButtonOutput(ctx: Pick<ButtonContext, "send" | "notice" | "setButtons">): ButtonOutput {
  return {
    reply: async (message) => {
      await ctx.send(toOutgoing(message));
    },
    // 버튼에는 입력 중 표시 경로가 없다 — 표시용이라 생략
    typing: async () => undefined,
    notice: async (text) => {
      if (text !== undefined) await ctx.notice(text);
    },
    removeButtons: () => ctx.setButtons([]),
  };
}

/** Discord "입력 중" 은 약 10초 지속 — 그 전에 다시 부른다. */
export const TYPING_REFRESH_MS = 9_000;

/**
 * 오래 걸리는 처리(AI · Vision · 싱크 · 리포트) 동안 "입력 중" 을 이어 보인다 — 시작 1회 + `intervalMs` 마다.
 * `typing` 의 실패는 표시용이라 삼킨다(chat 이 경고 1줄). 처리 결과·예외는 그대로 돌려준다.
 */
export async function withTyping<T>(
  typing: () => Promise<void>,
  task: () => Promise<T>,
  intervalMs: number = TYPING_REFRESH_MS,
): Promise<T> {
  const tick = (): void => {
    typing().catch(() => undefined);
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  try {
    return await task();
  } finally {
    clearInterval(timer);
  }
}
