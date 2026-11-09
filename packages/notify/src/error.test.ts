import { describe, expect, it } from 'vitest';
import { getErrorCode, isHtmlParseError, isNetworkError, sanitizeError, sanitizeMessage } from './error';

// 정본: myFinance src/bot/utils/error.ts (003 §3-1 — NETWORK_CODES 7개 · ENOTFOUND · 최종 이중 마스킹)
const TOKEN = 'bot123456789:AAHfoo_bar-baz';

describe('sanitizeMessage', () => {
  it('봇 토큰을 마스킹한다', () => {
    expect(sanitizeMessage(`GET https://api.example.com/${TOKEN}/sendMessage`)).toBe(
      'GET https://api.example.com/bot<REDACTED>/sendMessage',
    );
  });
  it('토큰이 없으면 원문 그대로', () => {
    expect(sanitizeMessage('plain')).toBe('plain');
  });

  it('Discord 웹훅 URL 의 토큰을 가린다 (M-6a #141)', () => {
    expect(sanitizeMessage('POST https://discord.com/api/webhooks/123456/abc_DEF-9?wait=true failed')).toBe(
      'POST https://discord.com/api/webhooks/123456/<REDACTED>?wait=true failed',
    );
    expect(sanitizeMessage('Failed to parse URL from https://discord.com/api/v10/webhooks/1/tok-EN')).toBe(
      'Failed to parse URL from https://discord.com/api/v10/webhooks/1/<REDACTED>',
    );
  });

  // #333 — 인터랙션 토큰(콜백 · 후속 메시지 웹훅)
  const ITOK = 'aW50ZXJhY3Rpb246MTIzOjQ1Ng.x-Y_z=';
  it('인터랙션 콜백 URL 의 토큰을 가리고 id 와 /callback 은 남긴다 (#333)', () => {
    expect(sanitizeMessage(`POST https://discord.com/api/v10/interactions/1234567890/${ITOK}/callback 404`)).toBe(
      'POST https://discord.com/api/v10/interactions/1234567890/<REDACTED>/callback 404',
    );
  });
  it('인터랙션 후속 웹훅 URL 의 토큰을 가린다 — 하위 경로 · 접두 없는 경로 (#333)', () => {
    expect(sanitizeMessage(`PATCH https://discord.com/api/v10/webhooks/987/${ITOK}/messages/@original 401`)).toBe(
      'PATCH https://discord.com/api/v10/webhooks/987/<REDACTED>/messages/@original 401',
    );
    expect(sanitizeMessage(`path=/webhooks/987/${ITOK}`)).toBe('path=/webhooks/987/<REDACTED>');
  });
  it('id 가 비거나 undefined 여도 토큰을 가리고 쿼리는 남긴다 (#333 · 9-1 info)', () => {
    expect(sanitizeMessage(`POST /api/v10/webhooks//${ITOK}?wait=true`)).toBe('POST /api/v10/webhooks//<REDACTED>?wait=true');
    expect(sanitizeMessage(`POST /interactions/undefined/${ITOK}/callback`)).toBe(
      'POST /interactions/undefined/<REDACTED>/callback',
    );
  });
  it('JSON 문자열 안의 인터랙션 토큰도 따옴표 앞까지 가린다 (#333)', () => {
    expect(sanitizeError({ url: `/interactions/5/${ITOK}/callback` })).toBe('{"url":"/interactions/5/<REDACTED>/callback"}');
  });
});

describe('sanitizeError', () => {
  it('Error.cause 체인을 " | " 로 잇고 각 단계를 마스킹한다', () => {
    const inner = new Error(`inner ${TOKEN}`);
    const outer = Object.assign(new Error('outer'), { cause: inner });
    expect(sanitizeError(outer)).toBe('Error: outer | Error: inner bot<REDACTED>');
  });
  it('HttpError 모양의 .error 필드도 따라간다', () => {
    const http = Object.assign(new Error('http'), { error: new Error('fetch failed') });
    expect(sanitizeError(http)).toBe('Error: http | Error: fetch failed');
  });
  it('문자열·객체·직렬화 불가 값을 처리한다', () => {
    expect(sanitizeError(`s ${TOKEN}`)).toBe('s bot<REDACTED>');
    expect(sanitizeError({ code: 'X' })).toBe('{"code":"X"}');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(sanitizeError(circular)).toBe('[unserializable]');
  });
  it('깊이 5 에서 멈춘다', () => {
    let err = new Error('e6');
    for (let i = 5; i >= 1; i--) err = Object.assign(new Error(`e${i}`), { cause: err });
    expect(sanitizeError(err)).toBe('Error: e1 | Error: e2 | Error: e3 | Error: e4 | Error: e5');
  });
  it('fin 정본의 이중 보호 — join 결과에 다시 마스킹을 건다', () => {
    // 각 part 는 이미 마스킹되므로 결과에 토큰이 남을 수 없다. 회귀: 003 §3-1 "sanitizeMessage(parts.join())"
    const err = Object.assign(new Error(`a ${TOKEN}`), { cause: `b ${TOKEN}` });
    expect(sanitizeError(err)).not.toContain(TOKEN);
    expect(sanitizeError(err)).toBe('Error: a bot<REDACTED> | b bot<REDACTED>');
  });
});

describe('getErrorCode', () => {
  it('중첩된 code 를 찾는다', () => {
    const err = Object.assign(new Error('x'), { cause: Object.assign(new Error('y'), { code: 'ECONNRESET' }) });
    expect(getErrorCode(err)).toBe('ECONNRESET');
  });
  it('code 가 없으면 undefined', () => {
    expect(getErrorCode(new Error('x'))).toBeUndefined();
    expect(getErrorCode('str')).toBeUndefined();
  });
});

describe('isNetworkError', () => {
  it.each(['ETIMEDOUT', 'ECONNRESET', 'ENETUNREACH', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENOTFOUND'])(
    'NETWORK_CODES %s (fin 정본 7개 · ENOTFOUND 포함)',
    (code) => {
      expect(isNetworkError(Object.assign(new Error('n'), { code }))).toBe(true);
    },
  );
  it('클라이언트 timeout 메시지 · AbortError · type=aborted 를 잡는다', () => {
    expect(isNetworkError(new Error("Request to 'sendMessage' timed out after 30 seconds"))).toBe(true);
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(isNetworkError(abort)).toBe(true);
    expect(isNetworkError(Object.assign(new Error('a'), { type: 'aborted' }))).toBe(true);
  });
  it('일반 오류·HTML 파싱 오류는 네트워크 오류가 아니다', () => {
    expect(isNetworkError(new Error("Bad Request: can't parse entities"))).toBe(false);
    expect(isNetworkError(Object.assign(new Error('x'), { code: 'EACCES' }))).toBe(false);
    expect(isNetworkError('str')).toBe(false);
  });
});

describe('isHtmlParseError', () => {
  it("can't parse entities · Bad Request: …entit… 만 잡는다 (fit 정본 · fin 의 400 전체가 아니다)", () => {
    expect(isHtmlParseError(new Error("Bad Request: can't parse entities: Unsupported start tag"))).toBe(true);
    expect(isHtmlParseError(new Error('Bad Request: unsupported entity'))).toBe(true);
    expect(isHtmlParseError(new Error('Bad Request: message is too long'))).toBe(false);
    expect(isHtmlParseError(Object.assign(new Error('x'), { error_code: 400 }))).toBe(false);
    expect(isHtmlParseError("can't parse entities")).toBe(true);
  });
});
