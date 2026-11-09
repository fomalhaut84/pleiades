/**
 * 봇 에러 처리 유틸 — 토큰 마스킹.
 *
 * pleiades#96: 옛 채널 전송 전용 분류(`isNetworkError`·`getErrorCode`·`isHtmlParseError`)는 운영 소비자 0 이라 지웠다(fin 은 009 D-5 B4 · #512).
 * `TOKEN_RE` 는 옛 봇 토큰 모양(`bot<id>:<secret>`)이다 — 남은 로그·기록 문자열에 섞여 있을 수 있어 마스킹은 남긴다.
 */

const TOKEN_RE = /bot\d+:[A-Za-z0-9_-]+/g;

export function sanitizeMessage(msg: string): string {
  return msg.replace(TOKEN_RE, "bot<REDACTED>");
}

export function sanitizeError(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  let depth = 0;
  const MAX_DEPTH = 5;
  while (cur != null && depth < MAX_DEPTH) {
    if (cur instanceof Error) {
      parts.push(`${cur.name}: ${sanitizeMessage(cur.message)}`);
      const withInner = cur as { error?: unknown; cause?: unknown };
      cur = withInner.error ?? withInner.cause;
    } else if (typeof cur === "string") {
      parts.push(sanitizeMessage(cur));
      break;
    } else {
      try {
        parts.push(sanitizeMessage(JSON.stringify(cur)));
      } catch {
        parts.push("[unserializable]");
      }
      break;
    }
    depth++;
  }
  return parts.join(" | ");
}
