/**
 * 허용 검사 — 모든 진입점(메시지 · 버튼)에서 사용자 ID **그리고** 채널 ID (009 0-2 · #147 결정 계승).
 *
 * ID 는 문자열로만 비교한다 — Discord ID 는 64비트라 number 로 바꾸면 끝자리가 틀린다(R4).
 * 목록이 비면 전부 거부한다(fail-closed · R8 — guild 채널은 다른 멤버가 볼 수 있다).
 */

export type IdList = () => readonly string[];

const norm = (ids: readonly string[]): string[] => ids.map((s) => String(s).trim()).filter((s) => s !== '');

export function isAllowed(userId: string, channelId: string, users: IdList, channels: IdList): boolean {
  if (userId === '' || channelId === '') return false;
  return norm(users()).includes(userId) && norm(channels()).includes(channelId);
}

/** 채널만 — 허용 채널의 낯선 사용자를 기록할지 가르는 데만 쓴다(처리 허용은 `isAllowed`). */
export function channelAllowed(channelId: string, channels: IdList): boolean {
  return channelId !== '' && norm(channels()).includes(channelId);
}
