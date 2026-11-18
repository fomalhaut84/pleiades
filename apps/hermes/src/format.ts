/**
 * Discord 로 나가는 모양(014 §3-E · H-1b #794).
 *
 * 받은 글은 **평문**이다 — notify `escapeDiscordMarkdown` 으로 escape 하고 제목만 굵게(출처가 마크다운을 보내도 서식이 되지 않는다).
 * - 링크는 **하나**(`link` 칸) — 마스크 링크를 쓰지 않고 `🔗 <label> · <주소>` 로 주소가 늘 보이게(013 R2).
 *   판정 · 표시 모두 **한 번 파싱한 URL 의 정규화 주소**로 한다(원문과 파서가 다르게 읽는 `\` 같은 글자로 허용 호스트를
 *   우회하지 않게 · #794 9-1 critical) · 주소의 서식 · 링크 문자는 퍼센트 인코딩(가짜 마스크 링크 방지).
 *   출처의 허용 호스트 밖이거나 링크 줄이 너무 길면 줄을 뺀다(차단 아님 · 건수는 상태 파일로).
 * - text · title · label 안의 맨 주소(`scheme://`)는 자동 링크가 되지 않게 끊는다(`:` 뒤 U+200B) — 링크 하나 · 허용 호스트
 *   규칙을 본문으로 우회하지 않게(9-1 major). 미리보기는 요청의 flags 가 끈다(poster).
 * - 2000자를 넘으면 text 를 잘라 `…` — 나누지 않는다(스팟 알림은 한 건 한 메시지).
 */
import { escapeDiscordMarkdown } from "@pleiades/notify";
import { POST_MAX } from "./checks";
import type { QueuedMessage } from "./queue";
import type { Source } from "./registry";

export interface Formatted {
  readonly content: string;
  readonly username: string;
  readonly linkDropped: boolean;
}

const USERNAME_PREFIX = "spot·";
/** 차단 고정 문구 · 이름을 쓸 수 없을 때의 이름 */
export const HERMES_USERNAME = `${USERNAME_PREFIX}hermes`;
const FORBIDDEN_NAME_RE = /discord|clyde/i;
const ELLIPSIS = "…";
/** 본문에 최소한 남길 자리 — 링크 줄이 이보다 많이 먹으면 링크 줄을 뺀다 */
const MIN_BODY_ROOM = 200;
const ZWSP = "​";

/** 주소 안의 Discord 서식 · 링크 문자 → 퍼센트 인코딩 */
const URL_MARKUP_RE = /[[\]()_*~|`<>\\]/g;
const encodeMarkup = (href: string): string =>
  href.replace(URL_MARKUP_RE, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);

/** 평문 escape + 맨 주소 끊기 */
const plain = (s: string): string => escapeDiscordMarkdown(s).replace(/([A-Za-z][A-Za-z0-9+.-]*):(?=\/\/)/g, `$1:${ZWSP}`);

/** 허용이면 표시할 주소(정규화 + 인코딩) · 아니면 null */
function allowedHref(url: string, source: Source | null): string | null {
  if (source === null) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username !== "" || u.password !== "") return null;
  return source.linkHosts.includes(u.hostname.toLowerCase()) ? encodeMarkup(u.href) : null;
}

/** escape 한 결과가 room 안에 들도록 text 를 글자(코드 포인트) 단위로 자른다 — escape 를 반으로 자르지 않는다 */
function fitText(text: string, room: number): string {
  const full = plain(text);
  if (full.length <= room) return full;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (plain(chars.slice(0, mid).join("")).length + ELLIPSIS.length <= room) lo = mid;
    else hi = mid - 1;
  }
  return plain(chars.slice(0, lo).join("")) + ELLIPSIS;
}

function usernameOf(m: QueuedMessage, source: Source | null): string {
  const name = source?.name ?? m.source;
  return FORBIDDEN_NAME_RE.test(name) ? HERMES_USERNAME : USERNAME_PREFIX + name;
}

export function formatMessage(m: QueuedMessage, source: Source | null): Formatted {
  const warn = m.level === "warn" ? "⚠️ " : "";
  const head = m.title !== undefined ? `${warn}**${plain(m.title)}**\n` : warn;
  const href = m.link !== undefined ? allowedHref(m.link.url, source) : null;
  let tail = m.link !== undefined && href !== null ? `\n🔗 ${plain(m.link.label)} · ${href}` : "";
  if (POST_MAX - head.length - tail.length < MIN_BODY_ROOM) tail = "";
  const linkDropped = m.link !== undefined && tail === "";
  const body = fitText(m.text, POST_MAX - head.length - tail.length);
  return { content: head + body + tail, username: usernameOf(m, source), linkDropped };
}

export function blockedNotice(sourceId: string, reason: string): { content: string; username: string } {
  return { content: `[hermes] 게시 차단 · ${sourceId} · 사유 ${reason}`, username: HERMES_USERNAME };
}
