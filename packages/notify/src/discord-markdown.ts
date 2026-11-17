/**
 * 본문 형식 → Discord 본문 (013 P2-a · #756).
 *
 * 발신 경로(웹훅 · 봇 transport · gateway · chat 답장)는 `toDiscordMarkdown` 하나만 쓴다 — 형식마다 모든 경우를 따지는 switch 라
 * 새 형식을 더해도 조용히 escape 쪽으로 빠지지 않는다(013 §3 · 감사 r1 #1).
 *
 * `markdown` 은 모델이 쓴 마크다운(AI 장문)을 **한 번만** 다듬어 보낸다(옛 MD → HTML → MD 이중 변환 대신). 서식(제목 · 목록 ·
 * 굵게 · 인용 · 코드)은 살리고, 해가 되는 것만 막는다(013 §4-2):
 *   - 표 → 행마다 목록 `- **첫 열** — 헤더: 값 · 헤더: 값`(F1 · Discord 는 표가 없다)
 *   - 가짜 링크 `[보이는 글](주소)` → `보이는 글 (주소)` — 주소가 늘 보인다(R2)
 *   - `<` 는 모두 escape — `<@…>` `<#…>` `<t:…>` `</cmd:id>` `<:e:id>` 표기가 되지 않게(R3 · `escapeDiscordMarkdown` 과 같다)
 *   - `>>> ` 는 다음 빈 줄까지 각 줄 `> ` 로 — 조각 나머지 전체를 삼키지 않게(R4)
 *   - `####` 이하 제목 → 굵은 줄(Discord 는 `#`~`###` 만) · 가로줄 → 빈 줄(Discord 는 가로줄이 없다)
 *   - 코드 블록 · 인라인 코드 안은 바꾸지 않는다(R8)
 * 멘션은 발신 쪽 `allowed_mentions: { parse: [] }` 가 막는다(글자는 남는다 · R6).
 */
import { escapeDiscordMarkdown, htmlToDiscordMarkdown } from './discord-md';
import type { BodyFormat } from './types';

/** 본문을 Discord 마크다운으로 — 형식마다 한 길(모든 경우를 따진다). */
export function toDiscordMarkdown(text: string, format: BodyFormat): string {
  switch (format) {
    case 'html':
      return htmlToDiscordMarkdown(text);
    case 'plain':
      return escapeDiscordMarkdown(text);
    case 'markdown':
      return discordMarkdown(text);
    default: {
      const unknown: never = format;
      throw new Error(`@pleiades/notify: 알 수 없는 본문 형식 (${String(unknown)})`);
    }
  }
}

const FENCE_RE = /^\s*```/;
const HR_RE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const DEEP_HEADING_RE = /^(\s*)#{4,}\s+(.*?)\s*#*\s*$/;
const BLOCK_QUOTE_RE = /^(\s*)>>>\s?/;
/** 표 구분 줄 — `| --- | :---: |` · `--- | ---` (칸마다 대시 하나 이상 · 콜론 정렬 허용) */
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$|^\s*\|\s*:?-+:?\s*\|\s*$/;

/** 모델 마크다운 → Discord 마크다운(위 규칙). */
export function discordMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let inFence = false;
  let quoting = false; // `>>> ` 가 연 인용이 이어지는 중
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      quoting = false;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const header = cells(line);
      let j = i + 2;
      for (; j < lines.length && isTableRow(lines[j]) && !TABLE_SEP_RE.test(lines[j]); j++) out.push(rowItem(header, cells(lines[j])));
      i = j - 1;
      quoting = false;
      continue;
    }
    if (line.trim() === '') quoting = false;
    const q = BLOCK_QUOTE_RE.exec(line);
    if (q !== null) {
      quoting = true;
      out.push(`${q[1]}> ${inline(line.slice(q[0].length))}`);
      continue;
    }
    if (quoting && !/^\s*>/.test(line)) {
      out.push(`> ${blockLine(line)}`);
      continue;
    }
    out.push(blockLine(line));
  }
  return out.join('\n');
}

function blockLine(line: string): string {
  if (HR_RE.test(line)) return '';
  const h = DEEP_HEADING_RE.exec(line);
  if (h !== null) return `${h[1]}**${inline(h[2])}**`;
  return inline(line);
}

/** 인라인 코드(백틱 짝) 밖에만 링크 펼침 · `<` escape. 짝 없는 백틱은 글자로 둔다. */
function inline(s: string): string {
  let out = '';
  let last = 0;
  const CODE_RE = /(`+)[^`\n]*?\1/g;
  for (let m = CODE_RE.exec(s); m !== null; m = CODE_RE.exec(s)) {
    out += prose(s.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + prose(s.slice(last));
}

const LINK_RE = /\[([^\]\n]*)\]\(\s*<?((?:https?:\/\/)[^\s)>]+)>?\s*\)/g;

function prose(s: string): string {
  const linked = s.replace(LINK_RE, (_whole, label: string, url: string) => {
    const text = label.trim();
    return text === '' || text === url ? url : `${text} (${url})`;
  });
  // 이미 `\<` 인 것은 두 번 막지 않는다(lookbehind 없이 — ES2017 대상)
  return linked.replace(/(\\*)</g, (whole, bs: string) => (bs.length % 2 === 1 ? whole : `${bs}\\<`));
}

function isTableRow(line: string): boolean {
  return line.indexOf('|') >= 0 && line.trim() !== '' && !FENCE_RE.test(line);
}

/** 표 한 줄 → 칸들. 바깥 `|` 는 벗기고 `\|` 는 칸 안의 글자로 둔다. */
function cells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (s[i] === '|') {
      out.push(cur.trim());
      cur = '';
    } else cur += s[i];
  }
  out.push(cur.trim());
  return out;
}

/** 행 → 목록 한 줄(F1). 첫 칸이 이름 · 나머지는 `헤더: 값` (빈 값은 뺀다). */
function rowItem(header: string[], row: string[]): string {
  const name = (row[0] ?? '').replace(/^\*\*(.*)\*\*$/, '$1').trim();
  const pairs: string[] = [];
  for (let k = 1; k < row.length; k++) {
    const v = row[k];
    if (v === '') continue;
    const h = (header[k] ?? '').replace(/^\*\*(.*)\*\*$/, '$1').trim();
    pairs.push(h === '' ? v : `${h}: ${v}`);
  }
  const head = name === '' ? '' : `**${name}**`;
  const body = pairs.join(' · ');
  return inline(`- ${head}${head !== '' && body !== '' ? ' — ' : ''}${body}`);
}
