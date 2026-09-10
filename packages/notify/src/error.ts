/**
 * 봇 에러 처리 유틸 — 토큰 마스킹 + 네트워크/HTML 파싱 에러 분류.
 *
 * 정본: myFinance `src/bot/utils/error.ts` (003 §3-1 · 발견 15 차이 #1·#2 — `NETWORK_CODES` 7개 · `ENOTFOUND` 포함 ·
 * `sanitizeError` 최종 이중 마스킹). myFitness 판(85줄)과 export 5/5 가 같고 그 두 차이만 fin 을 따른다.
 * 원본 패턴: fomalhaut84/myFitness#108 · myFinance docs/specs/354-bot-ipv6-token-fix.md
 */

const TOKEN_RE = /bot\d+:[A-Za-z0-9_-]+/g;
const NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ENETUNREACH',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENOTFOUND', // DNS 일시 실패 (fin 정본 · fit 에는 없었다)
]);
const MAX_DEPTH = 5;

export function sanitizeMessage(msg: string): string {
  return msg.replace(TOKEN_RE, 'bot<REDACTED>');
}

/**
 * Error.cause + grammy HttpError.error 체인을 깊이 5까지 순회하며 message 추출 + 토큰 마스킹.
 * console.error(err) 가 inner FetchError 까지 dump 하는 문제 차단.
 */
export function sanitizeError(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  let depth = 0;
  while (cur != null && depth < MAX_DEPTH) {
    if (cur instanceof Error) {
      parts.push(`${cur.name}: ${sanitizeMessage(cur.message)}`);
      const withInner = cur as { error?: unknown; cause?: unknown };
      cur = withInner.error ?? withInner.cause;
    } else if (typeof cur === 'string') {
      parts.push(sanitizeMessage(cur));
      break;
    } else {
      try {
        parts.push(sanitizeMessage(JSON.stringify(cur)));
      } catch {
        parts.push('[unserializable]');
      }
      break;
    }
    depth++;
  }
  // 이중 보호: 각 part 가 이미 sanitize 됐지만, 누락된 필드가 join 시 섞이는 경우를 대비해 최종 결과에도 한 번 더.
  return sanitizeMessage(parts.join(' | '));
}

export function getErrorCode(err: unknown): string | undefined {
  let cur: unknown = err;
  let depth = 0;
  while (cur != null && depth < MAX_DEPTH) {
    if (cur && typeof cur === 'object') {
      const obj = cur as { code?: unknown; error?: unknown; cause?: unknown };
      if (typeof obj.code === 'string') return obj.code;
      cur = obj.error ?? obj.cause;
    } else {
      break;
    }
    depth++;
  }
  return undefined;
}

const GRAMMY_TIMEOUT_RE = /Request to '.+' timed out after \d+ seconds/i;
const ABORT_NAME_RE = /^AbortError$/i;

/**
 * 네트워크 에러 판별 — ETIMEDOUT/ECONNRESET 등 + grammy client.timeoutSeconds 발동
 * (code 없는 plain Error) + fetch abort (AbortError · type='aborted') 모두 포착.
 */
export function isNetworkError(err: unknown): boolean {
  const code = getErrorCode(err);
  if (code !== undefined && NETWORK_CODES.has(code)) return true;
  let cur: unknown = err;
  let depth = 0;
  while (cur != null && depth < MAX_DEPTH) {
    if (cur instanceof Error) {
      if (GRAMMY_TIMEOUT_RE.test(cur.message)) return true;
      if (ABORT_NAME_RE.test(cur.name)) return true;
      const obj = cur as { type?: unknown; error?: unknown; cause?: unknown };
      if (obj.type === 'aborted') return true;
      cur = obj.error ?? obj.cause;
    } else {
      break;
    }
    depth++;
  }
  return false;
}

/**
 * 텔레그램 HTML 파싱 실패 판별 (fit 공유 정규식 · 003 §3-1 정본).
 * fin 로컬 `isParseError` 의 "error_code === 400 전체" 는 승계하지 않는다 — 비-파싱 400 은 폴백하지 않고 그대로 올라간다
 * (관측 변경 후보 · 빈도 미측정 · 003 §5-2 정정 ①).
 */
export function isHtmlParseError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /can't parse entities|Bad Request:.*entit/i.test(msg);
}
