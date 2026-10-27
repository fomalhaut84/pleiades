/**
 * 받은 첨부 → `Attachment` (009 0-3 · R6). 내용은 `download()` 로만, 검증을 거친 뒤에.
 *
 * - 형식: 허용 목록(정확히 `image/png` 또는 접두 `image/`)에 없으면 거부. 형식을 모르면 거부(fail-closed).
 * - 크기: 플랫폼이 알려 준 크기 · `content-length` · **실제로 받은 바이트** 셋 다 본다 — 받는 도중 상한을 넘으면 끊는다.
 * - 출처: Discord CDN 호스트(https)만 — payload 가 다른 주소를 담아도 내려받지 않는다.
 */
import type { ChatFetch, ChatResponse } from './rest';
import type { Attachment } from './types';

export interface AttachmentPolicy {
  maxBytes: number;
  /** `image/png` 처럼 정확히, 또는 `image/` 처럼 `/` 로 끝나는 접두. */
  allowedTypes: readonly string[];
}

export const DEFAULT_ATTACHMENT_POLICY: AttachmentPolicy = {
  maxBytes: 10 * 1024 * 1024,
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
};

const CDN_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);

interface RawAttachment {
  id?: unknown;
  filename?: unknown;
  size?: unknown;
  content_type?: unknown;
  url?: unknown;
}

export function typeAllowed(contentType: string | undefined, allowed: readonly string[]): boolean {
  if (contentType === undefined) return false;
  const t = contentType.split(';')[0].trim().toLowerCase();
  if (t === '') return false;
  return allowed.some((a) => {
    const p = a.toLowerCase();
    return p.endsWith('/') ? t.startsWith(p) : t === p;
  });
}

function cdnUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && CDN_HOSTS.has(u.hostname) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

async function readCapped(res: ChatResponse, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (reader === undefined) {
    if (res.arrayBuffer === undefined) throw new Error('@pleiades/chat: 첨부 응답 본문을 읽을 수 없다');
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > max) throw new Error(`@pleiades/chat: 첨부 상한 초과 (${buf.byteLength} > ${max} 바이트)`);
    return buf;
  }
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`@pleiades/chat: 첨부 상한 초과 (받는 중 ${total} > ${max} 바이트)`);
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

export function toAttachment(raw: RawAttachment, policy: AttachmentPolicy, fetchFn: () => ChatFetch): Attachment {
  const name = typeof raw.filename === 'string' ? raw.filename : '';
  const size = Number(raw.size);
  const contentType = typeof raw.content_type === 'string' ? raw.content_type : undefined;
  const url = cdnUrl(raw.url);
  return {
    id: String(raw.id ?? ''),
    name,
    size: Number.isFinite(size) ? size : -1,
    contentType,
    async download() {
      if (!typeAllowed(contentType, policy.allowedTypes)) {
        throw new Error(`@pleiades/chat: 허용하지 않는 첨부 형식 (${contentType ?? '모름'})`);
      }
      if (!Number.isFinite(size) || size < 0 || size > policy.maxBytes) {
        throw new Error(`@pleiades/chat: 첨부 상한 초과 또는 크기 모름 (${size} · 상한 ${policy.maxBytes} 바이트)`);
      }
      if (url === undefined) throw new Error('@pleiades/chat: 첨부 주소가 Discord CDN 이 아니다');
      const res = await fetchFn()(url, { method: 'GET', headers: {} });
      if (!res.ok) throw new Error(`@pleiades/chat: 첨부 내려받기 응답 ${res.status}`);
      const declared = Number(res.headers?.get('content-length') ?? Number.NaN);
      if (Number.isFinite(declared) && declared > policy.maxBytes) {
        throw new Error(`@pleiades/chat: 첨부 상한 초과 (${declared} > ${policy.maxBytes} 바이트)`);
      }
      return readCapped(res, policy.maxBytes);
    },
  };
}
