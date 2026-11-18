/**
 * 받기 검증 — 본문(§2 API v1) · `Idempotency-Key`(H-1a #791).
 *
 * 형식만 본다(필드 · 길이 · 링크 스킴). 비밀 · 토큰 · 개인정보 검사는 게시 직전에 한다(§3-F · H-1b) — 응답에 드러나지 않게.
 * 실패는 **사유 코드만** 돌려준다(값을 응답·로그에 담지 않는다).
 */
import type { Level, Link } from "./queue";

export type MessageReason = "json" | "shape" | "title" | "text" | "link" | "level" | "unknown-field";

export interface ValidMessage {
  readonly title?: string;
  readonly text: string;
  readonly link?: Link;
  readonly level: Level;
}

export const LIMITS = {
  title: 100,
  text: 1500,
  linkLabel: 80,
  linkUrl: 2048,
  idempotencyKey: 128,
} as const;

const FIELDS = new Set(["title", "text", "link", "level"]);
const LINK_FIELDS = new Set(["label", "url"]);
/** 줄바꿈 · 탭 밖의 제어 문자 — 제어 문자를 막는 것이 목적이라 no-control-regex 를 끈다 */
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex
const ONE_LINE_BAD_RE = /[\u0000-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex
const URL_BAD_CHAR_RE = /[\s\u0000-\u001f\u007f]/;
/** 보이는 ASCII(공백 없음) */
const IDEM_RE = /^[\x21-\x7e]+$/;

const chars = (s: string): number => [...s].length;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fail = (reason: MessageReason) => ({ ok: false as const, reason });

function oneLine(v: unknown, max: number): v is string {
  return typeof v === "string" && v.trim() !== "" && chars(v) <= max && !ONE_LINE_BAD_RE.test(v);
}

function validLink(v: unknown): v is Link {
  if (!isObject(v) || Object.keys(v).some((k) => !LINK_FIELDS.has(k))) return false;
  if (!oneLine(v.label, LIMITS.linkLabel) || typeof v.url !== "string" || v.url.length > LIMITS.linkUrl) return false;
  // URL 파서는 탭 · 줄바꿈을 지우고 앞뒤 공백을 자른 뒤 판정한다 — 원문을 저장하므로 원문에 그런 글자가 있으면 거절(#791 9-1 major ·
  // 게시 때 링크 줄에서 가짜 줄이 된다)
  if (URL_BAD_CHAR_RE.test(v.url)) return false;
  let u: URL;
  try {
    u = new URL(v.url);
  } catch {
    return false;
  }
  return u.protocol === "https:" && u.username === "" && u.password === "" && u.hostname !== "";
}

export function validateMessage(raw: string): { ok: true; value: ValidMessage } | { ok: false; reason: MessageReason } {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("json");
  }
  if (!isObject(body)) return fail("shape");
  if (Object.keys(body).some((k) => !FIELDS.has(k))) return fail("unknown-field");
  const { title, text, link, level } = body;
  if (typeof text !== "string" || text.trim() === "" || chars(text) > LIMITS.text || CONTROL_RE.test(text))
    return fail("text");
  if (title !== undefined && !oneLine(title, LIMITS.title)) return fail("title");
  if (link !== undefined && !validLink(link)) return fail("link");
  if (level !== undefined && level !== "info" && level !== "warn") return fail("level");
  return {
    ok: true,
    value: {
      ...(title !== undefined ? { title } : {}),
      text,
      ...(link !== undefined ? { link: { label: link.label, url: link.url } } : {}),
      level: level ?? "info",
    },
  };
}

export function validateIdempotencyKey(
  v: string | string[] | undefined,
): { ok: true; value: string | null } | { ok: false; reason: "idempotency-key" } {
  if (v === undefined) return { ok: true, value: null };
  if (typeof v !== "string" || v.length > LIMITS.idempotencyKey || !IDEM_RE.test(v)) {
    return { ok: false, reason: "idempotency-key" };
  }
  return { ok: true, value: v };
}
