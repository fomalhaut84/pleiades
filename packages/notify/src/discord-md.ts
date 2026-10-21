/**
 * HTML(텔레그램 부분집합) → Discord 마크다운 역변환기 (003 §4-3 제약 3 · §7-1 · M-6a #141).
 *
 * 본문은 계속 HTML 로 생성·저장되고(fin 은 HTML 이 저장 포맷 — 발견 14) Discord 로 나갈 때만 바뀐다.
 * 정방향(`markdownToTelegramHtml`)의 대칭 역함수가 아니다(§7-1 정정) — 두 가지가 새로 필요하다:
 *   1. 태그 → md 서식 **생성**
 *   2. **텍스트 노드 안의 md 메타문자 escape** — 사용자 입력(종목명·전략명)에 `*`·`_` 이 있으면 서식으로 렌더된다(서식 주입).
 * 코드(`code`·`pre`) 안은 escape 하지 않는다 — Discord 는 코드 안의 백슬래시를 그대로 보여 준다.
 *
 * 지원 태그(텔레그램 HTML parse_mode 집합): b·strong · i·em · u·ins · s·strike·del · code · pre · a[href] · blockquote ·
 * tg-spoiler·span.tg-spoiler. 그 밖의 태그는 벗기고 안쪽만 남긴다. 닫히지 않은 태그는 끝에서 닫는다.
 */

interface ElementNode {
  readonly kind: 'element';
  readonly tag: string;
  readonly attrs: string;
  readonly children: Node[];
}
interface TextNode {
  readonly kind: 'text';
  readonly text: string;
}
type Node = ElementNode | TextNode;

const TAG_RE = /<(\/?)([a-zA-Z][\w-]*)([^<>]*)>/g;

/** HTML 문자열을 관대하게 트리로 읽는다 — 짝이 없는 닫는 태그는 버리고, 열린 태그는 끝에서 닫는다. */
function parse(html: string): Node[] {
  const root: ElementNode = { kind: 'element', tag: '#root', attrs: '', children: [] };
  const stack: ElementNode[] = [root];
  const top = (): ElementNode => stack[stack.length - 1];
  let last = 0;
  TAG_RE.lastIndex = 0;
  for (let m = TAG_RE.exec(html); m !== null; m = TAG_RE.exec(html)) {
    const index = m.index;
    if (index > last) top().children.push({ kind: 'text', text: html.slice(last, index) });
    last = index + m[0].length;
    const tag = m[2].toLowerCase();
    if (m[1] === '/') {
      const at = findOpen(stack, tag);
      if (at > 0) stack.length = at; // 짝이 맞는 곳까지 닫는다(사이에 열린 태그도 함께)
      continue;
    }
    const attrs = m[3];
    if (tag === 'br') {
      top().children.push({ kind: 'text', text: '\n' });
      continue;
    }
    const el: ElementNode = { kind: 'element', tag, attrs, children: [] };
    top().children.push(el);
    if (!/\/\s*$/.test(attrs)) stack.push(el); // 자기 닫힘 `<x/>` 은 스택에 올리지 않는다 (ES2017 — trimEnd 없음)
  }
  if (last < html.length) top().children.push({ kind: 'text', text: html.slice(last) });
  return root.children;
}

function findOpen(stack: ElementNode[], tag: string): number {
  for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) return i;
  return -1;
}

const ENTITY_RE = /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g;
const NAMED: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(ENTITY_RE, (whole, e: string) => {
    if (e[0] !== '#') return NAMED[e] ?? whole;
    const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/**
 * 어디서나 서식이 되는 문자 — `\` 는 escape 자체이므로 같은 정규식 한 번에 처리한다.
 * `[` `]` 를 막으면 마스크 링크 `[x](url)` 가 생기지 않으므로 `(` `)` 는 그대로 둔다(한국어 본문에 흔하다).
 * `<` 는 `<t:…>`·`<#…>`·`<@…>`(타임스탬프·채널·멘션 표기)가 되지 않게 막는다.
 */
const INLINE_META_RE = /[\\*_~`|[\]<]/g;
/** 줄 머리에서만 서식이 되는 것 — 인용(`>`) · 제목(`#`) · 목록(`-`·`+`) · 번호 목록(`1.`). */
const LINE_HEAD_RE = /^([ \t]*)([>#+-]|\d+\.)/gm;

/** 일반 텍스트를 Discord 에서 글자 그대로 보이게 한다 (서식 주입 방지 · §7-1 정정 6-A). */
export function escapeDiscordMarkdown(text: string): string {
  return text
    .replace(INLINE_META_RE, '\\$&')
    // 번호 목록은 점 앞에 — `\1.` 은 escape 가 아니다(숫자는 문장부호가 아니다)
    .replace(LINE_HEAD_RE, (_, ws: string, mark: string) => (mark.endsWith('.') ? `${ws}${mark.slice(0, -1)}\\.` : `${ws}\\${mark}`));
}

function textOf(nodes: Node[]): string {
  return nodes.map((n) => (n.kind === 'text' ? decodeEntities(n.text) : textOf(n.children))).join('');
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs);
  return m === null ? undefined : decodeEntities(m[1] ?? m[2] ?? m[3]);
}

/** 인라인 코드 — 본문에 백틱이 있으면 더 긴 울타리를 쓴다. */
function inlineCode(raw: string): string {
  if (raw === '') return '';
  const longest = Math.max(0, ...(raw.match(/`+/g) ?? []).map((r) => r.length));
  const fence = '`'.repeat(longest + 1);
  const pad = raw.startsWith('`') || raw.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${raw}${pad}${fence}`;
}

/** 안쪽 앞뒤 공백은 기호 바깥으로 — `** 제목 **` 은 Discord 가 서식으로 읽지 않는다. */
function wrap(mark: string, inner: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
  const [lead, core, trail] = m === null ? ['', inner, ''] : [m[1], m[2], m[3]];
  return core === '' ? inner : `${lead}${mark}${core}${mark}${trail}`;
}

function render(nodes: Node[]): string {
  let out = '';
  for (const n of nodes) {
    const piece = renderNode(n);
    // 인용·코드 블록은 줄 머리에서만 블록이 된다 — 앞이 줄 중간이면 줄을 바꾼다
    const block = n.kind === 'element' && (n.tag === 'blockquote' || n.tag === 'pre');
    out += block && piece !== '' && out !== '' && !out.endsWith('\n') ? `\n${piece}` : piece;
  }
  return out;
}

function renderNode(n: Node): string {
  if (n.kind === 'text') return escapeDiscordMarkdown(decodeEntities(n.text));
  switch (n.tag) {
    case 'b':
    case 'strong':
      return wrap('**', render(n.children));
    case 'i':
    case 'em':
      return wrap('*', render(n.children));
    case 'u':
    case 'ins':
      return wrap('__', render(n.children));
    case 's':
    case 'strike':
    case 'del':
      return wrap('~~', render(n.children));
    case 'tg-spoiler':
      return wrap('||', render(n.children));
    case 'span':
      return /\btg-spoiler\b/.test(attr(n.attrs, 'class') ?? '') ? wrap('||', render(n.children)) : render(n.children);
    case 'code':
      return inlineCode(textOf(n.children));
    case 'pre':
      return renderPre(n);
    case 'a':
      return renderLink(n);
    case 'blockquote':
      return renderQuote(render(n.children));
    default:
      return render(n.children);
  }
}

function renderPre(n: ElementNode): string {
  // <pre><code class="language-x">…</code></pre> — 텔레그램의 언어 지정 형식
  const only = n.children.length === 1 ? n.children[0] : undefined;
  const lang =
    only?.kind === 'element' && only.tag === 'code' ? /language-([\w+-]+)/.exec(attr(only.attrs, 'class') ?? '')?.[1] : undefined;
  // 본문의 연속 백틱 3개는 울타리를 닫는다 — 백틱 2개마다 영폭 공백을 끼워 어디에도 3연속이 남지 않게 한다
  // (```` 처럼 4개 이상도 — PR #142 Codex P2)
  const body = textOf(n.children).replace(/``(?=`)/g, '``\u200b').replace(/\n+$/, '');
  return `\`\`\`${lang ?? ''}\n${body}\n\`\`\``;
}

function renderLink(n: ElementNode): string {
  const href = attr(n.attrs, 'href');
  const label = render(n.children);
  if (href === undefined || !/^https?:\/\//i.test(href)) return label;
  // encodeURIComponent 는 괄호를 인코딩하지 않는다 — 괄호가 남으면 `)` 가 링크를 일찍 닫는다
  const url = href.replace(/[()\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
  return label === '' ? url : `[${label}](${url})`;
}

function renderQuote(inner: string): string {
  if (inner === '') return '';
  const body = inner.replace(/\n+$/, '');
  return `${body
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')}\n`;
}

/** 텔레그램 HTML 본문을 Discord 마크다운으로. 결과는 그대로 `content` 로 보낼 수 있다. */
export function htmlToDiscordMarkdown(html: string): string {
  return render(parse(html));
}

const FENCE_LINE_RE = /^```[\w+-]*$/;
/** 청크 끝에서 코드 블록을 닫고 다음 청크에서 다시 여는 데 드는 여유. */
const FENCE_RESERVE = 4 + 1 + 24;

/**
 * 변환된 Discord md 를 `max` 자 이하 청크로 나눈다 — `splitMessage` 와 달리 md 구조를 안다(사전 리뷰 major · #141).
 *   - 코드 블록(```` ``` ````)을 넘는 분할: 청크 끝에서 닫고 다음 청크에서 같은 언어로 다시 연다
 *   - 한 줄이 너무 길어 자를 때: escape 쌍(`\*`)의 사이 · UTF-16 서로게이트 쌍의 사이를 피하고, 가능하면 공백에서 자른다
 * 줄을 넘는 인라인 서식(`**…**`)은 렌더러가 만들지 않는다 — 한 줄 안에서만 열고 닫는다. 아주 긴 한 줄 안의 서식은
 * 공백 우선 절단으로도 갈릴 수 있다(그 경우 양쪽에 기호가 글자로 보인다 · escape 는 풀리지 않는다).
 */
export function splitDiscordMarkdown(md: string, max: number): string[] {
  if (!(max > FENCE_RESERVE * 2)) throw new RangeError(`splitDiscordMarkdown: max 가 너무 작다 (${max})`);
  if (md.length <= max) return [md];
  const budget = max - FENCE_RESERVE;
  const chunks: string[] = [];
  let cur: string[] = [];
  let curLen = 0;
  let fence: string | null = null; // 열린 코드 블록의 여는 줄
  let onlyReopened = false; // cur 가 다시 연 울타리 줄뿐인가

  const push = (line: string): void => {
    curLen += (cur.length > 0 ? 1 : 0) + line.length;
    cur.push(line);
  };
  const flush = (): void => {
    if (cur.length === 0 || onlyReopened) return;
    chunks.push(fence === null ? cur.join('\n') : `${cur.join('\n')}\n\`\`\``);
    cur = [];
    curLen = 0;
    onlyReopened = false;
    if (fence !== null) {
      push(fence);
      onlyReopened = true;
    }
  };

  for (const line of md.split('\n')) {
    for (const piece of sliceLine(line, budget - (fence === null ? 0 : fence.length + 1))) {
      if (cur.length > 0 && curLen + 1 + piece.length > budget) flush();
      push(piece);
      onlyReopened = false;
      if (FENCE_LINE_RE.test(piece)) fence = fence === null ? piece : null;
    }
  }
  if (cur.length > 0 && !onlyReopened) chunks.push(cur.join('\n'));
  return chunks;
}

/** 한 줄을 `n` 자 이하 조각으로 — 공백 우선 · escape 쌍과 서로게이트 쌍은 가르지 않는다. */
function sliceLine(line: string, n: number): string[] {
  if (line.length <= n) return [line];
  const out: string[] = [];
  let i = 0;
  while (line.length - i > n) {
    let end = i + n;
    const space = line.lastIndexOf(' ', end - 1);
    if (space > i + Math.floor(n * 0.8)) end = space + 1;
    while (end > i + 1 && (endsWithOddBackslashes(line, i, end) || splitsSurrogate(line, end))) end--;
    out.push(line.slice(i, end));
    i = end;
  }
  out.push(line.slice(i));
  return out;
}

function endsWithOddBackslashes(s: string, from: number, end: number): boolean {
  let k = 0;
  while (end - 1 - k >= from && s.charCodeAt(end - 1 - k) === 0x5c) k++;
  return k % 2 === 1;
}

function splitsSurrogate(s: string, end: number): boolean {
  const hi = s.charCodeAt(end - 1);
  const lo = s.charCodeAt(end);
  return hi >= 0xd800 && hi <= 0xdbff && lo >= 0xdc00 && lo <= 0xdfff;
}
