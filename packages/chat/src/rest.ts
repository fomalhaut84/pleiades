/**
 * Discord 봇 REST — 채널 메시지 보내기·편집·버튼 교체·파일 + 인터랙션 원본 편집 + `GET /gateway/bot` (009 0-3).
 *
 * 2000자를 넘는 본문은 잘라 버리지 않는다(R1) — 보낼 때는 나눠 보내고, 편집할 때는 첫 조각으로 바꾼 뒤 나머지를 새 메시지로 잇는다.
 * 버튼은 마지막 조각에만. 재시도·429 대기는 notify 의 `requestDiscord` 를 그대로 쓴다(같은 루프 두 벌을 두지 않는다).
 * 토큰·인터랙션 토큰이 든 URL 은 로그·오류에 나오지 않는다.
 */
import {
  DEFAULT_RETRY_DELAYS_MS,
  DISCORD_API_BASE,
  DISCORD_DEFAULT_MAX_FILE_BYTES,
  DISCORD_MAX_LENGTH,
  defaultSleep,
  escapeDiscordMarkdown,
  htmlToDiscordMarkdown,
  requestDiscord,
  splitDiscordMarkdown,
  type FormDataLike,
  type PostConfig,
} from '@pleiades/notify';
import { toComponents } from './buttons';
import type { ButtonRows, Logger, Outgoing, OutgoingFile, OutgoingMessage, SentMessage } from './types';

/** 응답의 최소 형태 — 첨부 내려받기용 필드(`arrayBuffer` · `headers` · `body`)는 있을 때만 쓴다. */
export interface ChatResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
  readonly headers?: { get(name: string): string | null };
  readonly body?: {
    getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> };
  } | null;
}
export interface ChatRequestInit {
  method: string;
  headers: Record<string, string>;
  /** GET 에는 두지 않는다(undici 는 GET 본문을 거부한다). */
  body?: string | FormDataLike;
  /** `AbortSignal` — 타입은 최소 형태만. */
  signal?: unknown;
}
/** 전역 `fetch` 의 최소 형태 — DOM·undici 타입에 결합하지 않는다(소비자 prepare 는 @types 없이 컴파일된다). */
export type ChatFetch = (url: string, init: ChatRequestInit) => Promise<ChatResponse>;

export interface RestOptions {
  /** 봇 토큰 — 부를 때마다 읽는다. */
  token: () => string;
  fetch?: ChatFetch;
  apiBase?: string;
  logger?: Logger;
  retryDelaysMs?: readonly number[];
  maxRateLimitWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** 보내는 파일 상한. 기본 10 MiB(notify 와 같다). */
  maxFileBytes?: number;
}

export interface GatewayBotLimit {
  /** 남은 IDENTIFY 횟수. */
  remaining: number;
  total: number;
  /** 창이 다시 차기까지(ms). */
  resetAfterMs: number;
}

export interface Rest {
  send(channelId: string, msg: Outgoing): Promise<SentMessage>;
  edit(channelId: string, messageId: string, msg: Outgoing): Promise<void>;
  setButtons(channelId: string, messageId: string, rows: ButtonRows): Promise<void>;
  sendFile(channelId: string, file: OutgoingFile): Promise<SentMessage>;
  /** 인터랙션 원본 편집 — 넘치는 조각은 `channelId` 에 새 메시지로. */
  editOriginal(hookUrl: string, channelId: string, msg: Outgoing): Promise<void>;
  setOriginalButtons(hookUrl: string, rows: ButtonRows): Promise<void>;
  /** 인터랙션 응답(204 · 본문 없음). */
  interactionCallback(url: string, body: unknown): Promise<void>;
  /** 인터랙션 후속 메시지(누른 사람에게만 · flags 64). */
  followupEphemeral(hookUrl: string, text: string): Promise<void>;
  gatewayBot(): Promise<GatewayBotLimit | undefined>;
  readonly fetch: () => ChatFetch;
}

const CHANNEL_ID_RE = /^\d{5,25}$/;
const EPHEMERAL = 64;
const GATEWAY_BOT_TIMEOUT_MS = 5000;
const NO_PINGS = { parse: [] as string[] };

export function normalize(msg: Outgoing): OutgoingMessage {
  return typeof msg === 'string' ? { text: msg, format: 'plain' } : msg;
}

/** 본문 → Discord md 조각들(빈 조각 제외). 전부 비면 던진다. */
export function toChunks(msg: OutgoingMessage): string[] {
  const md = msg.format === 'html' ? htmlToDiscordMarkdown(msg.text) : escapeDiscordMarkdown(msg.text);
  const chunks = splitDiscordMarkdown(md, DISCORD_MAX_LENGTH).filter((c) => c.trim() !== '');
  if (chunks.length === 0) throw new Error('@pleiades/chat: 보낼 본문이 비었다');
  return chunks;
}

function defaultFetch(): ChatFetch {
  const f = (globalThis as { fetch?: ChatFetch }).fetch;
  if (f === undefined) throw new Error('@pleiades/chat: 전역 fetch 가 없다 — fetch 옵션을 넘긴다');
  return f;
}

export function createRest(opts: RestOptions): Rest {
  const base = opts.apiBase ?? DISCORD_API_BASE;
  const fetchFn = (): ChatFetch => opts.fetch ?? defaultFetch();
  const maxFileBytes = opts.maxFileBytes ?? DISCORD_DEFAULT_MAX_FILE_BYTES;
  const cfg = (): PostConfig => ({
    fetch: fetchFn(),
    retryDelaysMs: opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS,
    maxRateLimitWaitMs: opts.maxRateLimitWaitMs ?? 10_000,
    sleep: opts.sleep ?? defaultSleep,
    logger: opts.logger ?? console,
  });
  const token = (): string => {
    const t = opts.token().trim();
    if (t === '') throw new Error('@pleiades/chat: Discord 봇 토큰이 없다');
    return t;
  };
  const channelUrl = (channelId: string): string => {
    if (!CHANNEL_ID_RE.test(channelId)) throw new Error('@pleiades/chat: 채널 ID 형식이 틀렸다');
    return `${base}/channels/${channelId}/messages`;
  };
  const botJson = (method: string, body: unknown) => (): ChatRequestInit => ({
    method,
    headers: { 'content-type': 'application/json', authorization: `Bot ${token()}` },
    body: JSON.stringify(body),
  });
  const hookJson = (method: string, body: unknown) => (): ChatRequestInit => ({
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  /** 응답에 메시지 id 가 오는 요청 — notify 의 재시도·429 루프. */
  const request = (url: string, init: () => ChatRequestInit): Promise<string> =>
    requestDiscord(cfg(), url, 'chat', init as () => { method: string; headers: Record<string, string>; body: string | FormDataLike }, 'API');

  /** 한 메시지에만 담을 수 있는 짧은 문구(파일 설명 · 본인 안내) — 넘치면 첫 조각만 보내고 경고한다(#332 사전 리뷰 info 5). */
  const firstChunk = (msg: OutgoingMessage, what: string): string => {
    const chunks = toChunks(msg);
    if (chunks.length > 1) (opts.logger ?? console).warn(`[chat] ${what}이 2000자를 넘어 첫 조각만 보낸다`);
    return chunks[0];
  };
  const sent = (channelId: string, id: string): SentMessage => ({
    id,
    channelId,
    edit: (msg) => rest.edit(channelId, id, msg),
    setButtons: (rows) => rest.setButtons(channelId, id, rows),
  });

  /** 여러 조각을 채널에 보낸다 — 버튼은 마지막에. 마지막 메시지 id. */
  const sendChunks = async (channelId: string, chunks: readonly string[], buttons: ButtonRows | undefined): Promise<string> => {
    const components = buttons === undefined ? undefined : toComponents(buttons);
    let id = '';
    for (let i = 0; i < chunks.length; i++) {
      const last = i === chunks.length - 1;
      id = await request(
        channelUrl(channelId),
        botJson('POST', {
          content: chunks[i],
          allowed_mentions: NO_PINGS,
          ...(last && components !== undefined ? { components } : {}),
        }),
      );
    }
    return id;
  };

  /**
   * 편집 공통 — 한 조각이면 그대로 바꾼다. 여러 조각이면 원본을 첫 조각으로 바꾸고 나머지를 이어 보낸다.
   * 버튼: `undefined` = 원본 버튼 유지(이어 보낸 조각엔 없음) · 주어지면 마지막 조각에(원본이 마지막이 아니면 원본 버튼은 지운다).
   */
  const editWith = async (
    patch: (body: Record<string, unknown>) => Promise<void>,
    channelId: string,
    msg: Outgoing,
  ): Promise<void> => {
    const m = normalize(msg);
    const chunks = toChunks(m);
    const components = m.buttons === undefined ? undefined : toComponents(m.buttons);
    const single = chunks.length === 1;
    await patch({
      content: chunks[0],
      allowed_mentions: NO_PINGS,
      ...(components === undefined ? {} : { components: single ? components : [] }),
    });
    if (!single) await sendChunks(channelId, chunks.slice(1), m.buttons);
  };

  const rest: Rest = {
    async send(channelId, msg) {
      const m = normalize(msg);
      return sent(channelId, await sendChunks(channelId, toChunks(m), m.buttons));
    },
    edit(channelId, messageId, msg) {
      return editWith(
        async (body) => {
          await request(`${channelUrl(channelId)}/${encodeURIComponent(messageId)}`, botJson('PATCH', body));
        },
        channelId,
        msg,
      );
    },
    async setButtons(channelId, messageId, rows) {
      await request(`${channelUrl(channelId)}/${encodeURIComponent(messageId)}`, botJson('PATCH', { components: toComponents(rows) }));
    },
    async sendFile(channelId, file) {
      if (file.data.byteLength > maxFileBytes) {
        throw new Error(`@pleiades/chat: 보낼 파일 상한 초과 (${file.data.byteLength} > ${maxFileBytes} 바이트)`);
      }
      const g = globalThis as { FormData?: new () => FormDataLike; Blob?: new (parts: unknown[], o?: { type?: string }) => unknown };
      if (g.FormData === undefined || g.Blob === undefined) throw new Error('@pleiades/chat: 전역 FormData·Blob 이 없다 (Node ≥ 18)');
      const FormDataCtor = g.FormData;
      const BlobCtor = g.Blob;
      const caption = file.caption === undefined || file.caption === '' ? '' : firstChunk({ text: file.caption }, '파일 설명');
      const payload = JSON.stringify({ content: caption, allowed_mentions: NO_PINGS, attachments: [{ id: 0, filename: file.name }] });
      const url = channelUrl(channelId);
      const id = await request(url, () => {
        const form = new FormDataCtor();
        form.append('payload_json', payload);
        form.append('files[0]', new BlobCtor([file.data], { type: file.contentType ?? 'application/octet-stream' }), file.name);
        return { method: 'POST', headers: { authorization: `Bot ${token()}` }, body: form };
      });
      return sent(channelId, id);
    },
    editOriginal(hookUrl, channelId, msg) {
      return editWith(
        async (body) => {
          await request(`${hookUrl}/messages/@original`, hookJson('PATCH', body));
        },
        channelId,
        msg,
      );
    },
    async setOriginalButtons(hookUrl, rows) {
      await request(`${hookUrl}/messages/@original`, hookJson('PATCH', { components: toComponents(rows) }));
    },
    async interactionCallback(url, body) {
      const res = await fetchFn()(url, hookJson('POST', body)());
      if (!res.ok) throw new Error(`@pleiades/chat: 인터랙션 응답 ${res.status}`);
    },
    async followupEphemeral(hookUrl, text) {
      await request(hookUrl, hookJson('POST', { content: firstChunk({ text }, '본인 안내'), flags: EPHEMERAL, allowed_mentions: NO_PINGS }));
    },
    async gatewayBot() {
      // IDENTIFY 를 붙잡지 않게 짧은 상한(#332 사전 리뷰 info 4) — 시간 초과면 로컬 기록만으로 판단
      const g = globalThis as { AbortSignal?: { timeout?: (ms: number) => unknown } };
      const signal = g.AbortSignal?.timeout?.(GATEWAY_BOT_TIMEOUT_MS);
      try {
        const res = await fetchFn()(`${base}/gateway/bot`, {
          method: 'GET',
          headers: { authorization: `Bot ${token()}` },
          ...(signal === undefined ? {} : { signal }),
        });
        if (!res.ok) return undefined;
        const lim = ((await res.json()) as { session_start_limit?: Record<string, unknown> })?.session_start_limit;
        const remaining = Number(lim?.remaining);
        const total = Number(lim?.total);
        const resetAfterMs = Number(lim?.reset_after);
        if (![remaining, total, resetAfterMs].every(Number.isFinite)) return undefined;
        return { remaining, total, resetAfterMs };
      } catch {
        return undefined;
      }
    },
    fetch: fetchFn,
  };
  return rest;
}
