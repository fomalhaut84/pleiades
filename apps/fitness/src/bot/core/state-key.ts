// pleiades 009 D-2 PR-2 (pleiades#364 · 설계 S): 봇 대화 상태(식단 편집 대기 등)의 키.
// Discord 는 허용 사용자가 여럿일 수 있어 채널 + 사용자 단위. 플랫폼 접두를 둔다(009 D-5 B2 #504 에서 텔레그램 키는 지웠다).

/** 상태 키 — `discord:<channelId>:<userId>`. */
export type StateKey = string;

export function discordStateKey(channelId: string, userId: string): StateKey {
  return `discord:${channelId}:${userId}`;
}
