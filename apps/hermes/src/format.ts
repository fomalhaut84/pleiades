/**
 * Discord 로 나가는 모양(014 §3-E · H-1b #794).
 *
 * 받은 글은 **평문**이다 — notify `escapeDiscordMarkdown` 으로 escape 하고 제목만 굵게(출처가 마크다운을 보내도 서식이 되지 않는다).
 * 링크는 마스크 링크를 쓰지 않고 `🔗 <label> · <주소>` 로 주소가 늘 보이게(013 R2). 주소의 서식 · 링크 문자는 퍼센트 인코딩해
 * 가짜 마스크 링크가 생기지 않게 한다. 출처의 허용 호스트 밖이면 링크 줄을 뺀다(차단 아님 · 건수는 상태 파일로).
 * 2000자를 넘으면 text 를 잘라 `…` — 나누지 않는다(스팟 알림은 한 건 한 메시지).
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
/** 차단 고정 문구의 이름 — 출처 이름을 쓰지 않는다(그 출처가 보낸 것이 아니다) */
export const HERMES_USERNAME = `${USERNAME_PREFIX}hermes`;
const ELLIPSIS = "…";

/** 주소 안의 Discord 서식 · 링크 문자 → 퍼센트 인코딩 */
const URL_MARKUP_RE = /[[\]()_*~|`<>\\]/g;
const displayUrl = (url: string): string =>
  url.replace(URL_MARKUP_RE, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);

function linkAllowed(url: string, source: Source | null): boolean {
  if (source === null) return false;
  try {
    return source.linkHosts.includes(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** escape 한 결과가 room 안에 들도록 text 를 글자(코드 포인트) 단위로 자른다 — escape 를 반으로 자르지 않는다 */
function fitText(text: string, room: number): string {
  const full = escapeDiscordMarkdown(text);
  if (full.length <= room) return full;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (escapeDiscordMarkdown(chars.slice(0, mid).join("")).length + ELLIPSIS.length <= room) lo = mid;
    else hi = mid - 1;
  }
  return escapeDiscordMarkdown(chars.slice(0, lo).join("")) + ELLIPSIS;
}

export function formatMessage(m: QueuedMessage, source: Source | null): Formatted {
  const warn = m.level === "warn" ? "⚠️ " : "";
  const head = m.title !== undefined ? `${warn}**${escapeDiscordMarkdown(m.title)}**\n` : warn;
  const linkDropped = m.link !== undefined && !linkAllowed(m.link.url, source);
  const tail =
    m.link !== undefined && !linkDropped ? `\n🔗 ${escapeDiscordMarkdown(m.link.label)} · ${displayUrl(m.link.url)}` : "";
  const body = fitText(m.text, POST_MAX - head.length - tail.length);
  return { content: head + body + tail, username: USERNAME_PREFIX + (source?.name ?? m.source), linkDropped };
}

export function blockedNotice(sourceId: string, reason: string): { content: string; username: string } {
  return { content: `[hermes] 게시 차단 · ${sourceId} · 사유 ${reason}`, username: HERMES_USERNAME };
}
