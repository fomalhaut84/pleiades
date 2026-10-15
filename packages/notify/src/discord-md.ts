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
 */
const INLINE_META_RE = /[\\*_~`|[\]]/g;
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

function wrap(mark: string, inner: string): string {
  return inner === '' ? '' : `${mark}${inner}${mark}`;
}

function render(nodes: Node[]): string {
  return nodes.map(renderNode).join('');
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
  // 본문의 ``` 는 울타리를 닫는다 — 영폭 공백으로 끊는다
  const body = textOf(n.children).replace(/```/g, '`​``').replace(/\n+$/, '');
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
