/**
 * DiscordTransport — 웹훅 기반 포트 구현 (003 §6 1b-1 · M-6a #141). 텍스트 알림만 — 인터랙션·첨부는 1b-2.
 *
 * **어댑터 소유 모드(`maxLength: Infinity`).** 003 §4-3 제약 2 — 분할은 변환 **뒤** 길이로 해야 한다. HTML→md 변환은
 * 길이를 바꾸므로(태그 축소 · escape 확대) 코어가 HTML 길이로 자르면 틀린다. 그래서 이 어댑터가
 * 변환 → 2000자 분할 → 청크별 재시도(네트워크 오류 · 429 `retry_after`)를 전부 소유하고, 코어는 `send` 를 한 번만 부른다.
 *
 * **target = 채널 별칭**(예 `finance`). 웹훅 URL 에는 토큰이 들어 있으므로 target·로그·오류 메시지에 URL 을 두지 않는다 —
 * 별칭 → URL 맵은 옵션으로만 받는다.
 */
import { htmlToDiscordMarkdown, escapeDiscordMarkdown } from './discord-md';
import { getErrorCode, isNetworkError, sanitizeError } from './error';
import { DEFAULT_RETRY_DELAYS_MS } from './deliver';
import { splitMessage } from './split';
import type { Content, Logger, MessageRef, Transport } from './types';

export const DISCORD_CHANNEL = 'discord';
/** Discord 메시지 `content` 상한. */
export const DISCORD_MAX_LENGTH = 2000;

/** `fetch` 의 최소 형태 — DOM·undici 타입에 결합하지 않는다(소비자 `prepare` 환경 · targets.ts 와 같은 이유). */
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<FetchResponseLike>;

export interface DiscordTransportOptions {
  /** 채널 별칭 → 웹훅 URL. 팩토리면 `send` 때마다 다시 읽는다(env 지연 해석). */
  webhooks: Readonly<Record<string, string>> | (() => Readonly<Record<string, string>>);
  /** 기본 `globalThis.fetch`(Node ≥ 18). */
  fetch?: FetchLike;
  /** 네트워크 오류 재시도 백오프. 기본 코어와 같은 `[2000, 8000, 30000]`. */
  retryDelaysMs?: readonly number[];
  /** 429 한 번에 기다릴 최대 시간. 넘으면 기다리지 않고 실패로 올린다. 기본 10초. */
  maxRateLimitWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** 재시도 로그. 기본 `console`. */
  logger?: Logger;
}

/** 웹훅 응답 오류. 메시지에 URL 을 담지 않는다. */
export class DiscordWebhookError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`Discord webhook 응답 ${status}${detail === '' ? '' : `: ${detail}`}`);
    this.name = 'DiscordWebhookError';
    this.status = status;
  }
}

/** undici `fetch` 의 연결 실패 코드 — 공용 `isNetworkError` 는 grammy·node 코드만 안다. */
const UNDICI_NETWORK_CODES = new Set(['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT']);

function isRetryableNetworkError(err: unknown): boolean {
  if (isNetworkError(err)) return true;
  const code = getErrorCode(err);
  return code !== undefined && UNDICI_NETWORK_CODES.has(code);
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function defaultFetch(): FetchLike {
  const f = (globalThis as { fetch?: FetchLike }).fetch;
  if (f === undefined) throw new Error('@pleiades/notify: 전역 fetch 가 없다 — DiscordTransportOptions.fetch 를 넘긴다');
  return f;
}

/** 본문을 Discord `content` 로 — html 은 역변환, plain 은 글자 그대로 보이게 escape. */
export function toDiscordContent(content: Content): string {
  return content.format === 'html' ? htmlToDiscordMarkdown(content.text) : escapeDiscordMarkdown(content.text);
}

export function createDiscordTransport(opts: DiscordTransportOptions): Transport {
  const retryDelaysMs = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const maxRateLimitWaitMs = opts.maxRateLimitWaitMs ?? 10_000;
  const sleep = opts.sleep ?? defaultSleep;
  const logger = opts.logger ?? console;

  const webhookFor = (alias: string): string => {
    const map = typeof opts.webhooks === 'function' ? opts.webhooks() : opts.webhooks;
    const url = Object.prototype.hasOwnProperty.call(map, alias) ? map[alias] : undefined;
    if (url === undefined || url === '') throw new Error(`@pleiades/notify: Discord 웹훅이 설정되지 않은 채널 별칭 (${alias})`);
    return url;
  };

  const post = async (url: string, alias: string, text: string): Promise<MessageRef> => {
    const fetchFn = opts.fetch ?? defaultFetch();
    const maxAttempts = retryDelaysMs.length + 1;
    let rateLimited = 0;
    for (let attempt = 0; ; attempt++) {
      let res: FetchResponseLike;
      try {
        res = await fetchFn(`${url}${url.includes('?') ? '&' : '?'}wait=true`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // 본문의 @everyone · @here · <@id> 가 핑을 만들지 않는다
          body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }),
        });
      } catch (err) {
        if (!isRetryableNetworkError(err) || attempt >= maxAttempts - 1) throw err;
        const delay = retryDelaysMs[attempt];
        logger.warn(`[discord] 전송 재시도 ${attempt + 1}/${maxAttempts} (${alias}, ${delay}ms 후): ${sanitizeError(err)}`);
        await sleep(delay);
        continue;
      }
      if (res.ok) {
        const body = (await res.json()) as { id?: unknown };
        if (typeof body?.id !== 'string') throw new DiscordWebhookError(res.status, '응답에 메시지 id 가 없다');
        return body.id;
      }
      if (res.status === 429 && rateLimited < 2) {
        const waitMs = await retryAfterMs(res);
        if (waitMs !== undefined && waitMs <= maxRateLimitWaitMs) {
          rateLimited++;
          attempt--; // 429 는 보내지지 않은 것이라 네트워크 재시도 예산을 쓰지 않는다
          logger.warn(`[discord] 속도 제한 (${alias}) — ${waitMs}ms 후 다시 보낸다`);
          await sleep(waitMs);
          continue;
        }
      }
      throw new DiscordWebhookError(res.status, await errorDetail(res));
    }
  };

  return {
    channel: DISCORD_CHANNEL,
    maxLength: Number.POSITIVE_INFINITY,
    async send(target: string, content: Content): Promise<MessageRef> {
      if (content.components !== undefined) {
        // 텔레그램 인라인 키보드 같은 인터랙션은 1b-2 범위 — 버튼 없이 보내면 사용자가 할 일을 잃는다
        throw new Error('@pleiades/notify: DiscordTransport 는 components(인터랙션)를 지원하지 않는다 — 1b-2');
      }
      const url = webhookFor(target);
      const chunks = splitMessage(toDiscordContent(content), DISCORD_MAX_LENGTH).filter((c) => c.trim() !== '');
      if (chunks.length === 0) throw new Error('@pleiades/notify: Discord 로 보낼 본문이 비었다');
      // 청크 k 가 끝내 실패하면 앞 청크는 이미 나갔다 — 그대로 실패로 올린다(코어는 재시도하지 않는다 · Infinity 모드).
      let ref = '';
      for (const chunk of chunks) ref = await post(url, target, chunk);
      return ref; // 마지막 청크의 메시지 id (Delivery.ref 계약)
    },
  };
}

async function retryAfterMs(res: FetchResponseLike): Promise<number | undefined> {
  try {
    const body = (await res.json()) as { retry_after?: unknown };
    const sec = typeof body?.retry_after === 'number' ? body.retry_after : Number.NaN;
    return Number.isFinite(sec) && sec >= 0 ? Math.ceil(sec * 1000) : undefined;
  } catch {
    return undefined;
  }
}

async function errorDetail(res: FetchResponseLike): Promise<string> {
  try {
    const raw = await res.text();
    try {
      const parsed = JSON.parse(raw) as { message?: unknown; code?: unknown };
      if (typeof parsed.message === 'string') {
        return typeof parsed.code === 'number' ? `${parsed.message} (code ${parsed.code})` : parsed.message;
      }
    } catch {
      // JSON 이 아니면 앞부분만
    }
    return raw.slice(0, 200);
  } catch {
    return '';
  }
}
