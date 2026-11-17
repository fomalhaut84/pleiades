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
 *   - 모든 `<` 뒤 · 남은 `](` 사이에 폭 없는 공백 — `<@…>` `<#…>` `<t:…>` `</cmd:id>` `<:e:id>` 표기 · 가짜 링크가 되지 않게(R3 · R2) ·
 *     **코드 안에도 건다**(보이지 않는다 — 코드 판정이 Discord 와 어긋나도 안전은 그대로 · `neutralize`)
 *   - `>>> ` 는 다음 빈 줄까지 각 줄 `> ` 로 — 조각 나머지 전체를 삼키지 않게(R4)
 *   - `####` 이하 제목 → 굵은 줄(Discord 는 `#`~`###` 만) · 가로줄 → 빈 줄(Discord 는 가로줄이 없다)
 *   - 코드 블록 · 인라인 코드 안은 겉모양 규칙(표 · 제목 · 링크 펼침)을 걸지 않는다(R8) — 위 폭 없는 공백만 들어간다
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

/**
 * 코드 블록 — Discord 처럼 **아무 위치의 ```` ``` ```` 부터 다음 ```` ``` ```` 까지**(첫 짝). 줄 단위로 여닫으면 닫는 줄의 꼬리 ·
 * 줄 중간 펜스 · 인용 안 펜스에서 Discord 와 어긋나 정리가 꺼졌다(#756 9-1 critical 2회). 짝 없는 ```` ``` ```` 는 글자다.
 */
const FENCE_BLOCK_RE = /```[\s\S]*?```/g;
const HR_RE = /^\s*([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const DEEP_HEADING_RE = /^(\s*)#{4,}[ \t]+/;
const BLOCK_QUOTE_RE = /^(\s*)>>>\s?/;
/** 표 구분 줄(앞뒤 공백을 뗀 줄에) — `| --- | :---: |` · `--- | ---` · `|---|` */
const TABLE_SEP_RE = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?$|^\|[ \t]*:?-+:?[ \t]*\|$/;
const isTableSep = (line: string): boolean => TABLE_SEP_RE.test(line.trim());

/** 모델 마크다운 → Discord 마크다운(위 규칙). */
export function discordMarkdown(md: string): string {
  const text = md.replace(/\r\n?/g, '\n');
  let out = '';
  let last = 0;
  FENCE_BLOCK_RE.lastIndex = 0;
  for (let m = FENCE_BLOCK_RE.exec(text); m !== null; m = FENCE_BLOCK_RE.exec(text)) {
    out += proseBlock(text.slice(last, m.index), last === 0 || text[last - 1] === '\n') + m[0];
    last = m.index + m[0].length;
  }
  return neutralize(out + proseBlock(text.slice(last), last === 0 || text[last - 1] === '\n'));
}

/** U+200B(폭 없는 공백) — 보이지 않고 Discord 문법만 끊는다 */
const ZWSP = '\u200b';

/**
 * R2 · R3 차단 — **코드 판정과 무관하게 글 전체에**(#756 9-1 critical 3회 · 같은 계열). 코드 영역을 Discord 와 똑같이 가르려
 * 할 때마다 다른 우회가 나왔다(한 줄 펜스 · 줄 중간 펜스 · 인라인 코드가 먹은 펜스 · escape 된 백틱 · 인용 경계). 판정이
 * 틀려도 안전은 그대로이게 한다: `<` 뒤와 `](` 사이에 보이지 않는 문자를 넣어 표기 · 가짜 링크 문법을 끊는다 — 코드 안에서도
 * 보이지 않는다(백슬래시는 코드 안에서 글자로 보였다). 코드 판정은 이제 겉모양(표 · 제목 · 링크 펼침)에만 쓰인다.
 */
function neutralize(s: string): string {
  return s.replace(/</g, `<${ZWSP}`).replace(/\]\(/g, `]${ZWSP}(`);
}

/**
 * 코드 블록 밖 한 구간 — 줄 규칙(표 · 인용 · 제목 · 가로줄)은 진짜 줄 머리에서만 · 나머지는 인라인 규칙만.
 * `atLineStart` 가 거짓이면 첫 줄은 코드 블록 뒤에 이어진 줄 조각이다.
 */
function proseBlock(seg: string, atLineStart: boolean): string {
  const lines = seg.split('\n');
  const out: string[] = [];
  let quoting = false; // `>>> ` 가 연 인용이 이어지는 중(이 구간 안에서만)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && !atLineStart) {
      out.push(inline(line));
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = cells(line);
      let j = i + 2;
      const rows: string[] = [];
      for (; j < lines.length && isTableRow(lines[j]) && !isTableSep(lines[j]); j++) rows.push(rowItem(header, cells(lines[j])));
      // 행이 없는 표는 머리 줄을 글로 남긴다(통째로 사라지지 않게 · 9-1 info)
      out.push(...(rows.length > 0 ? rows : [inline(line)]));
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

/** 끝 공백 떼기 — `/\s+$/` 는 긴 공백 줄에서 제곱으로 느리다(trimEnd 는 ES2019) */
function rtrim(s: string): string {
  let end = s.length;
  while (end > 0 && /\s/.test(s[end - 1])) end--;
  return s.slice(0, end);
}

function blockLine(line: string): string {
  if (HR_RE.test(line)) return '';
  const h = DEEP_HEADING_RE.exec(line);
  if (h !== null) {
    // 정규식 하나로 끝 `#` · 공백까지 잡으면 긴 줄에서 역추적이 폭발한다(9-1 critical — 8천 자 100 초) — 문자열로 다듬는다
    let text = rtrim(line.slice(h[0].length));
    let end = text.length;
    while (end > 0 && text[end - 1] === '#') end--;
    if (end < text.length && (end === 0 || /\s/.test(text[end - 1]))) text = rtrim(text.slice(0, end));
    return text === '' ? '' : `${h[1]}**${inline(text)}**`;
  }
  return inline(line);
}

/**
 * 인라인 코드(Discord 규칙: 같은 길이의 백틱 짝 · 내용이 비지 않음 · 닫는 백틱 뒤에 백틱이 더 없음 · 9-1 major) 밖에만
 * 링크 펼침 · `<` escape. 짝 없는 백틱은 글자로 둔다. 여러 줄에 걸친 인라인 코드는 줄마다 보므로 그 안의 `<` 는 `\<` 로 보인다(외관만).
 */
function inline(s: string): string {
  let out = '';
  let last = 0;
  const CODE_RE = /(`+)([^`\n]*?[^`\n])\1(?!`)/g;
  for (let m = CODE_RE.exec(s); m !== null; m = CODE_RE.exec(s)) {
    out += prose(s.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + prose(s.slice(last));
}

/** 흔한 링크 꼴 — `[글](주소)` · `[글](<주소>)` · 끝의 제목 `"…"` `'…'` · 스킴 대소문자 무관 */
const LINK_RE = /\[([^\]\n]*)\]\(\s*(?:<(https?:\/\/[^\s<>]+)>|(https?:\/\/[^\s)]+))(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/gi;

function prose(s: string): string {
  const linked = s
    .replace(LINK_RE, (_whole, label: string, angled: string | undefined, bare: string | undefined) => {
      const url = angled ?? bare ?? '';
      const text = label.trim();
      return text === '' || text === url ? url : `${text} (${url})`;
    });
  // 펼치지 못한 꼴(괄호 중첩 · 라벨 안 코드 등)의 `](` 와 모든 `<` 는 마지막에 글 전체에서 끊는다(`neutralize`)
  return linked;
}

function isTableRow(line: string): boolean {
  return line.indexOf('|') >= 0 && line.trim() !== '';
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
