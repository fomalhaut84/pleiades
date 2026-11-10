/**
 * 봇 에러 처리 유틸 — 토큰 마스킹.
 *
 * pleiades#96: 옛 채널 전송 전용 분류(`isNetworkError`·`getErrorCode`·`isHtmlParseError`)는 운영 소비자 0 이라 지웠다(fin 은 009 D-5 B4 · #512).
 * pleiades#540: 마스킹은 `@pleiades/notify` 판을 그대로 쓴다 — 옛 봇 토큰 · Discord 웹훅 · 인터랙션 · Discord 봇 토큰.
 * 옛 앱 판은 옛 봇 토큰만 가려서 이 파일로 import 하면 웹훅 토큰이 조용히 남았다.
 */

export { sanitizeError, sanitizeMessage } from "@pleiades/notify";
