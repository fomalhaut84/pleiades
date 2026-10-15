/**
 * Discord 봇 송신 — 버튼(인터랙션)이 붙은 메시지용 (M-6b-2 #149 · 003 §6 1b-2).
 *
 * 채널 웹훅은 `custom_id` 버튼을 보낼 수 없다 — 봇 토큰으로 `POST /channels/{id}/messages` 를 부른다.
 * target = 채널 별칭(예 `finance`) → 옵션 맵의 채널 ID. 토큰·채널 ID 는 target·로그·오류에 나오지 않는다.
 * `components` 는 텔레그램 `inline_keyboard`(grammY `InlineKeyboard` 포함)를 그대로 받아 Discord 버튼으로 바꾼다 —
 * 호출부(키보드 3곳)는 바꾸지 않는다. 어댑터 소유 모드(`maxLength: Infinity`) · 버튼은 마지막 청크에만.
 */
import { escapeDiscordMarkdown, htmlToDiscordMarkdown, splitDiscordMarkdown } from './discord-md';
import {
  DISCORD_MAX_LENGTH,
  defaultSleep,
  requestDiscord,
  type FetchLike,
  type PostConfig,
} from './discord';
import { DEFAULT_RETRY_DELAYS_MS } from './deliver';
import type { Content, Logger, MessageRef, Transport } from './types';

export const DISCORD_BOT_CHANNEL = 'discord-bot';
export const DISCORD_API_BASE = 'https://discord.com/api/v10';

/** Discord 버튼 (message component type 2). */
export interface DiscordButton {
  type: 2;
  /** 2 = Secondary(콜백) · 5 = Link */
  style: 2 | 5;
  label: string;
  custom_id?: string;
  url?: string;
}
export interface DiscordActionRow {
  type: 1;
  components: DiscordButton[];
}

const MAX_ROWS = 5;
const MAX_BUTTONS_PER_ROW = 5;
const MAX_CUSTOM_ID = 100;
const MAX_LABEL = 80;

interface TelegramButtonLike {
  text?: unknown;
  callback_data?: unknown;
  url?: unknown;
}

/**
 * 텔레그램 인라인 키보드 → Discord 액션 행. `callback_data` → Secondary 버튼(`custom_id`) · `url` → Link 버튼.
 * Discord 한도(행 5 · 행당 5 · custom_id 100자 · label 80자)를 넘으면 조용히 자르지 않고 오류 — 버튼을 잃으면 할 일을 잃는다.
 */
export function toDiscordComponents(components: unknown): DiscordActionRow[] {
  const rows = (components as { inline_keyboard?: unknown } | null)?.inline_keyboard;
  if (!Array.isArray(rows)) throw new Error('@pleiades/notify: 알 수 없는 components 형태 — 텔레그램 inline_keyboard 만 지원');
  const nonEmpty = rows.filter((r): r is unknown[] => Array.isArray(r) && r.length > 0);
  if (nonEmpty.length > MAX_ROWS) throw new Error(`@pleiades/notify: Discord 버튼 행은 ${MAX_ROWS}개까지 (${nonEmpty.length})`);
  return nonEmpty.map((row) => {
    if (row.length > MAX_BUTTONS_PER_ROW) {
      throw new Error(`@pleiades/notify: Discord 버튼은 행당 ${MAX_BUTTONS_PER_ROW}개까지 (${row.length})`);
    }
    return {
      type: 1,
      components: row.map((raw) => {
        const b = raw as TelegramButtonLike;
        const label = typeof b.text === 'string' ? b.text : '';
        if (label === '' || label.length > MAX_LABEL) throw new Error(`@pleiades/notify: 버튼 이름은 1~${MAX_LABEL}자 (${label.length})`);
        if (typeof b.callback_data === 'string') {
          if (b.callback_data === '' || b.callback_data.length > MAX_CUSTOM_ID) {
            throw new Error(`@pleiades/notify: 버튼 custom_id 는 1~${MAX_CUSTOM_ID}자 (${b.callback_data.length})`);
          }
          return { type: 2, style: 2, label, custom_id: b.callback_data };
        }
        if (typeof b.url === 'string' && /^https?:\/\//i.test(b.url)) return { type: 2, style: 5, label, url: b.url };
        throw new Error('@pleiades/notify: 버튼에 callback_data 나 http(s) url 이 없다');
      }),
    };
  });
}

type Lazy<T> = T | (() => T);
const resolve = <T>(v: Lazy<T>): T => (typeof v === 'function' ? (v as () => T)() : v);

export interface DiscordBotTransportOptions {
  /** 봇 토큰. 팩토리면 보낼 때마다 다시 읽는다. */
  token: Lazy<string>;
  /** 채널 별칭 → 채널 ID. */
  channels: Lazy<Readonly<Record<string, string>>>;
  fetch?: FetchLike;
  retryDelaysMs?: readonly number[];
  maxRateLimitWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  logger?: Logger;
  /** 기본 `https://discord.com/api/v10` (테스트용). */
  apiBase?: string;
}

const CHANNEL_ID_RE = /^\d{5,25}$/;

export function createDiscordBotTransport(opts: DiscordBotTransportOptions): Transport {
  const cfg: PostConfig = {
    fetch: opts.fetch,
    retryDelaysMs: opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS,
    maxRateLimitWaitMs: opts.maxRateLimitWaitMs ?? 10_000,
    sleep: opts.sleep ?? defaultSleep,
    logger: opts.logger ?? console,
  };
  const base = opts.apiBase ?? DISCORD_API_BASE;

  return {
    channel: DISCORD_BOT_CHANNEL,
    maxLength: Number.POSITIVE_INFINITY,
    async send(target: string, content: Content): Promise<MessageRef> {
      const map = resolve(opts.channels);
      const channelId = Object.prototype.hasOwnProperty.call(map, target) ? map[target] : undefined;
      if (channelId === undefined || !CHANNEL_ID_RE.test(channelId)) {
        throw new Error(`@pleiades/notify: Discord 채널 ID 가 설정되지 않았거나 형식이 틀린 별칭 (${target})`);
      }
      const token = resolve(opts.token).trim();
      if (token === '') throw new Error('@pleiades/notify: Discord 봇 토큰이 없다');
      const components = content.components === undefined ? undefined : toDiscordComponents(content.components);
      const md = content.format === 'html' ? htmlToDiscordMarkdown(content.text) : escapeDiscordMarkdown(content.text);
      const chunks = splitDiscordMarkdown(md, DISCORD_MAX_LENGTH).filter((c) => c.trim() !== '');
      if (chunks.length === 0) throw new Error('@pleiades/notify: Discord 로 보낼 본문이 비었다');
      let ref = '';
      for (let i = 0; i < chunks.length; i++) {
        const body = {
          content: chunks[i],
          allowed_mentions: { parse: [] as string[] },
          ...(i === chunks.length - 1 && components !== undefined ? { components } : {}),
        };
        ref = await requestDiscord(
          cfg,
          `${base}/channels/${channelId}/messages`,
          target,
          () => ({
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bot ${token}` },
            body: JSON.stringify(body),
          }),
          'API',
        );
      }
      return ref; // 마지막 청크(버튼이 붙은 메시지)의 id
    },
  };
}
