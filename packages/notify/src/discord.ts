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
import { htmlToDiscordMarkdown, escapeDiscordMarkdown, splitDiscordMarkdown } from './discord-md';
import { getErrorCode, isNetworkError, sanitizeError } from './error';
import { DEFAULT_RETRY_DELAYS_MS } from './deliver';
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
/** multipart 본문(전역 `FormData`)의 최소 형태. */
export interface FormDataLike {
  append(name: string, value: unknown, filename?: string): void;
}
export interface RequestInitLike {
  method: string;
  /** multipart 는 헤더를 비워 둔다 — fetch 가 boundary 를 붙인다. */
  headers: Record<string, string>;
  body: string | FormDataLike;
}
export type FetchLike = (url: string, init: RequestInitLike) => Promise<FetchResponseLike>;

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

/**
 * 재시도할 네트워크 오류. 응답 대기 중 끊김(타임아웃·abort)은 Discord 가 이미 받았을 수 있어 중복 전송이 날 수 있다 —
 * 텔레그램 경로(코어 재시도)와 같은 성질이고, 누락보다 중복이 낫다는 원본 판단(fin `telegram.ts` withRetry 주석)을 따른다.
 */
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

  const cfg: PostConfig = { fetch: opts.fetch, retryDelaysMs, maxRateLimitWaitMs, sleep, logger };

  const post = (url: string, alias: string, text: string): Promise<MessageRef> =>
    postWebhook(cfg, url, alias, () => ({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // 본문의 @everyone · @here · <@id> 가 핑을 만들지 않는다
      body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }),
    }));

  return {
    channel: DISCORD_CHANNEL,
    maxLength: Number.POSITIVE_INFINITY,
    async send(target: string, content: Content): Promise<MessageRef> {
      if (content.components !== undefined) {
        // 텔레그램 인라인 키보드 같은 인터랙션은 1b-2 범위 — 버튼 없이 보내면 사용자가 할 일을 잃는다
        throw new Error('@pleiades/notify: DiscordTransport 는 components(인터랙션)를 지원하지 않는다 — 1b-2');
      }
      const url = webhookFor(opts.webhooks, target);
      const chunks = splitDiscordMarkdown(toDiscordContent(content), DISCORD_MAX_LENGTH).filter((c) => c.trim() !== '');
      if (chunks.length === 0) throw new Error('@pleiades/notify: Discord 로 보낼 본문이 비었다');
      // 청크 k 가 끝내 실패하면 앞 청크는 이미 나갔다 — 그대로 실패로 올린다(코어는 재시도하지 않는다 · Infinity 모드).
      let ref = '';
      for (const chunk of chunks) ref = await post(url, target, chunk);
      return ref; // 마지막 청크의 메시지 id (Delivery.ref 계약)
    },
  };
}

/** 첨부 파일 1개 (003 §7-4 — 포트 밖 · `Content` 에 첨부 개념을 넣지 않는다). */
export interface DiscordFile {
  name: string;
  data: Uint8Array;
  /** 기본 `application/octet-stream`. */
  contentType?: string;
}

export interface SendDiscordFileOptions extends DiscordTransportOptions {
  /** 업로드 상한(바이트). 기본 10 MiB(부스트 없는 서버의 웹훅 첨부 한도). 넘으면 보내지 않고 오류. */
  maxFileBytes?: number;
}

export const DISCORD_DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * 웹훅에 파일 1개를 첨부해 보낸다 (M-6b-1 #147 · 분기 PDF). 재시도·429·URL 비노출은 transport 와 같은 규칙.
 * 캡션은 글자 그대로(plain) 보이게 escape 한다. 반환은 메시지 id.
 */
export async function sendDiscordFile(
  opts: SendDiscordFileOptions,
  alias: string,
  file: DiscordFile,
  caption = '',
): Promise<MessageRef> {
  const max = opts.maxFileBytes ?? DISCORD_DEFAULT_MAX_FILE_BYTES;
  if (file.data.byteLength > max) {
    throw new Error(`@pleiades/notify: Discord 첨부 상한 초과 (${file.data.byteLength} > ${max} 바이트 · ${file.name})`);
  }
  const g = globalThis as { FormData?: new () => FormDataLike; Blob?: new (parts: unknown[], o?: { type?: string }) => unknown };
  if (g.FormData === undefined || g.Blob === undefined) {
    throw new Error('@pleiades/notify: 전역 FormData·Blob 이 없다 (Node ≥ 18 필요)');
  }
  const FormDataCtor = g.FormData;
  const BlobCtor = g.Blob;
  const cfg: PostConfig = {
    fetch: opts.fetch,
    retryDelaysMs: opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS,
    maxRateLimitWaitMs: opts.maxRateLimitWaitMs ?? 10_000,
    sleep: opts.sleep ?? defaultSleep,
    logger: opts.logger ?? console,
  };
  const url = webhookFor(opts.webhooks, alias);
  const payload = JSON.stringify({
    // escape 뒤 자르면 끝에 반쪽 escape(`\`)가 남을 수 있다 — md 를 아는 분할의 첫 조각 (#147 사전 리뷰 info)
    content: caption === '' ? '' : splitDiscordMarkdown(escapeDiscordMarkdown(caption), DISCORD_MAX_LENGTH)[0],
    allowed_mentions: { parse: [] },
    attachments: [{ id: 0, filename: file.name }],
  });
  return postWebhook(cfg, url, alias, () => {
    const form = new FormDataCtor();
    form.append('payload_json', payload);
    form.append('files[0]', new BlobCtor([file.data], { type: file.contentType ?? 'application/octet-stream' }), file.name);
    return { method: 'POST', headers: {}, body: form };
  });
}

interface PostConfig {
  fetch?: FetchLike;
  retryDelaysMs: readonly number[];
  maxRateLimitWaitMs: number;
  sleep: (ms: number) => Promise<void>;
  logger: Logger;
}

function webhookFor(webhooks: DiscordTransportOptions['webhooks'], alias: string): string {
  const map = typeof webhooks === 'function' ? webhooks() : webhooks;
  const url = Object.prototype.hasOwnProperty.call(map, alias) ? map[alias] : undefined;
  if (url === undefined || url === '') throw new Error(`@pleiades/notify: Discord 웹훅이 설정되지 않은 채널 별칭 (${alias})`);
  return url;
}

/** 웹훅 POST 1건 — 네트워크 재시도 · 429 대기 · 본문 읽기까지 같은 루프. `init` 은 시도마다 새로 만든다(multipart 본문 재사용 방지). */
async function postWebhook(cfg: PostConfig, url: string, alias: string, init: () => RequestInitLike): Promise<MessageRef> {
  const { retryDelaysMs, maxRateLimitWaitMs, sleep, logger } = cfg;
  const fetchFn = cfg.fetch ?? defaultFetch();
  const maxAttempts = retryDelaysMs.length + 1;
  let rateLimited = 0;
  for (let attempt = 0; ; attempt++) {
    let res: FetchResponseLike;
    let okBody: { id?: unknown } | undefined;
    let errBody: ErrorBody | undefined;
    try {
      res = await fetchFn(`${url}${url.includes('?') ? '&' : '?'}wait=true`, init());
      // 본문 읽기(성공·오류 둘 다)도 같은 재시도 안에 둔다 — 헤더 뒤 소켓이 끊기면(UND_ERR_SOCKET) 던진다 (PR #142 Codex P2)
      if (res.ok) okBody = (await res.json()) as { id?: unknown };
      else errBody = await readErrorBody(res);
    } catch (err) {
      if (!isRetryableNetworkError(err) || attempt >= maxAttempts - 1) throw err;
      const delay = retryDelaysMs[attempt];
      logger.warn(`[discord] 전송 재시도 ${attempt + 1}/${maxAttempts} (${alias}, ${delay}ms 후): ${sanitizeError(err)}`);
      await sleep(delay);
      continue;
    }
    if (res.ok) {
      if (typeof okBody?.id !== 'string') throw new DiscordWebhookError(res.status, '응답에 메시지 id 가 없다');
      return okBody.id;
    }
    const body = errBody ?? { raw: '', json: undefined };
    if (res.status === 429 && rateLimited < 2) {
      const waitMs = retryAfterMs(body);
      if (waitMs !== undefined && waitMs <= maxRateLimitWaitMs) {
        rateLimited++;
        attempt--; // 429 는 보내지지 않은 것이라 네트워크 재시도 예산을 쓰지 않는다
        logger.warn(`[discord] 속도 제한 (${alias}) — ${waitMs}ms 후 다시 보낸다`);
        await sleep(waitMs);
        continue;
      }
    }
    throw new DiscordWebhookError(res.status, errorDetail(body));
  }
}

/** 오류 응답 본문은 한 번만 읽는다(스트림 이중 소비 방지 · 사전 리뷰 info). */
interface ErrorBody {
  raw: string;
  json: { message?: unknown; code?: unknown; retry_after?: unknown } | undefined;
}

async function readErrorBody(res: FetchResponseLike): Promise<ErrorBody> {
  let raw = '';
  try {
    raw = await res.text();
  } catch (err) {
    if (isRetryableNetworkError(err)) throw err; // 끊김은 재시도 루프로 — 429 의 retry_after 를 잃지 않는다
    return { raw: '', json: undefined };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return { raw, json: typeof parsed === 'object' && parsed !== null ? (parsed as ErrorBody['json']) : undefined };
  } catch {
    return { raw, json: undefined };
  }
}

function retryAfterMs(body: ErrorBody): number | undefined {
  const sec = typeof body.json?.retry_after === 'number' ? body.json.retry_after : Number.NaN;
  return Number.isFinite(sec) && sec >= 0 ? Math.ceil(sec * 1000) : undefined;
}

function errorDetail(body: ErrorBody): string {
  const msg = body.json?.message;
  if (typeof msg === 'string') return typeof body.json?.code === 'number' ? `${msg} (code ${body.json.code})` : msg;
  return body.raw.slice(0, 200);
}
