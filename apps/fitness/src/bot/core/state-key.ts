// pleiades 009 D-2 PR-2 (pleiades#364 · 설계 S): 봇 대화 상태(식단 편집 대기 등)의 키.
// 텔레그램은 지금과 같은 chat 단위 · Discord 는 허용 사용자가 여럿일 수 있어 채널 + 사용자 단위.
// 플랫폼 접두가 있어 같은 숫자의 텔레그램 chat id 와 Discord id 가 서로의 상태를 소비하지 않는다.

/** 상태 키 — `telegram:<chatId>` 또는 `discord:<channelId>:<userId>`. */
export type StateKey = string;

export function telegramStateKey(chatId: number): StateKey {
  return `telegram:${chatId}`;
}

export function discordStateKey(channelId: string, userId: string): StateKey {
  return `discord:${channelId}:${userId}`;
}

/** 텔레그램 ctx 의 chat 에서 키를 만든다 — chat id 가 숫자가 아니면 undefined(옛 `typeof chatId !== "number"` 가드). */
export function telegramStateKeyOf(chat: { id?: unknown } | undefined): StateKey | undefined {
  const id = chat?.id;
  return typeof id === "number" ? telegramStateKey(id) : undefined;
}
