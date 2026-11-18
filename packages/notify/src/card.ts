/**
 * 카드 → Discord embed (013 P3-a1 · #773).
 *
 * 카드 글은 plain 이다 — 템플릿이 끼워 넣는 외부 값(종목명 · 사용자 입력)이 서식이 되지 않게 `escapeDiscordMarkdown` 을 거친다(013 §4-0).
 * 단 embed 꼬리말은 마크다운을 렌더링하지 않는 칸이라 원문 그대로 보낸다(행 목록 대체에서는 `-# ` 줄이라 escape 한다).
 * 한도(013 R9)는 **escape 뒤 길이**로 잰다. 넘으면 embed 를 만들지 않고 행 목록 텍스트(F1)로 바꿔 본문 뒤에 잇는다 —
 * 잘라 버리면 숫자를 잃는다. 길이는 UTF-16 단위로 센다(Discord 의 글자 수보다 크거나 같다 — 안전한 쪽).
 *
 * 발신 경로(웹훅 · 봇 transport)는 `planDiscordMessages` 하나로 조각과 카드를 나눈다 — 카드는 마지막 조각에만.
 */
import { escapeDiscordMarkdown, splitDiscordMarkdown } from './discord-md';
import { neutralize, toDiscordMarkdown } from './discord-markdown';
import type { Card, Content, Logger } from './types';

/** Discord embed 한도(013 R9). `total` 은 한 메시지의 모든 embed 글 합. */
export const CARD_LIMITS = {
  cards: 10,
  fields: 25,
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  total: 6000,
} as const;

/** Discord 메시지 `content` 상한 — 정본은 여기 · `discord.ts` 가 다시 내보낸다(순환 import 를 피해 이쪽에 둔다). */
export const DISCORD_MAX_LENGTH = 2000;
const ZWSP = '​';
const MAX_COLOR = 0xffffff;

export interface DiscordEmbed {
  title?: string;
  description?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  color?: number;
  footer?: { text: string };
}

/** 보낼 메시지 하나 — `content` 가 없으면 embed 만. */
export interface DiscordMessagePart {
  content?: string;
  embeds?: DiscordEmbed[];
}

const esc = (s: string | undefined): string => (s === undefined || s === '' ? '' : escapeDiscordMarkdown(s));
/**
 * 설명 칸 — `markdown` 은 **템플릿 마크다운**이다: 서식은 그대로 두고 안전 규칙(`<` · `](` 무력화 · 013 R2·R3)만 건다.
 * AI 답용 정리(표 · 제목 · 링크 펼치기)는 걸지 않는다 — escape 된 외부 값 `\[x\](url)` 이 링크 펼치기에 다시 걸려 깨졌다(P3-a2 9-1 major).
 * 아니면 escape.
 */
const descOf = (card: Card): string =>
  card.description === undefined || card.description === ''
    ? ''
    : card.descriptionFormat === 'markdown'
      ? neutralize(card.description)
      : escapeDiscordMarkdown(card.description);
/** 행 한 칸 — 줄바꿈은 공백으로(행 하나가 한 줄 · 9-1 info) · escape. */
const rowCell = (s: string): string => escapeDiscordMarkdown(s.replace(/\s*\r?\n\s*/g, ' '));

/**
 * 행 목록 설명(013 F1 · F8) — `• **이름** — 값` 줄들 · 이름 · 값은 escape(외부 값) · 서식만 이 함수가 붙인다.
 * 모바일에서 inline 칸이 세로로 무너져(2026-11-18 실측) 표는 이 모양으로 보낸다. 카드에 펼쳐 쓴다: `{ title, ...cardRowList(rows) }`.
 */
export function cardRowList(rows: readonly { label: string; text: string }[]): Pick<Card, 'description' | 'descriptionFormat'> {
  return {
    description: rows.map((r) => `• **${rowCell(r.label)}** — ${rowCell(r.text)}`).join('\n'),
    descriptionFormat: 'markdown',
  };
}
const orZwsp = (s: string): string => (s === '' ? ZWSP : s);

function assertCards(cards: unknown): asserts cards is readonly Card[] {
  if (!Array.isArray(cards)) throw new Error('@pleiades/notify: cards 는 배열이어야 한다');
}

function toEmbed(card: Card, i: number): DiscordEmbed {
  const fields = (card.fields ?? []).map((f) => ({
    name: orZwsp(esc(f.name)),
    value: orZwsp(esc(f.value)),
    ...(f.inline === true ? { inline: true } : {}),
  }));
  const title = esc(card.title);
  const description = descOf(card);
  // 꼬리말 칸은 마크다운을 렌더링하지 않는다 — escape 하면 `\_` 가 글자로 보인다(9-1 major) · 원문 그대로(주입 위험 없음)
  const footer = card.footer ?? '';
  if (title === '' && description === '' && fields.length === 0) {
    throw new Error(`@pleiades/notify: 빈 카드 (${i}번째) — 제목 · 설명 · 칸 중 하나는 있어야 한다`);
  }
  if (card.color !== undefined && !(Number.isInteger(card.color) && card.color >= 0 && card.color <= MAX_COLOR)) {
    throw new Error(`@pleiades/notify: 카드 색은 0x000000~0xFFFFFF 정수 (${i}번째)`);
  }
  return {
    ...(title !== '' ? { title } : {}),
    ...(description !== '' ? { description } : {}),
    ...(fields.length > 0 ? { fields } : {}),
    ...(card.color !== undefined ? { color: card.color } : {}),
    ...(footer !== '' ? { footer: { text: footer } } : {}),
  };
}

function embedLength(e: DiscordEmbed): number {
  const fieldLen = (e.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0);
  return (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text.length ?? 0) + fieldLen;
}

function withinLimits(e: DiscordEmbed): boolean {
  const fields = e.fields ?? [];
  return (
    (e.title?.length ?? 0) <= CARD_LIMITS.title &&
    (e.description?.length ?? 0) <= CARD_LIMITS.description &&
    (e.footer?.text.length ?? 0) <= CARD_LIMITS.footer &&
    fields.length <= CARD_LIMITS.fields &&
    fields.every((f) => f.name.length <= CARD_LIMITS.fieldName && f.value.length <= CARD_LIMITS.fieldValue)
  );
}

/**
 * 카드 → embed. **한도를 넘으면 `undefined`**(호출부가 텍스트로 대체한다).
 * 보일 것이 없는 카드 · 범위 밖 색 · 배열이 아닌 입력은 오류 — 조용히 버리지 않는다(버튼과 같은 계약).
 */
export function toDiscordEmbeds(cards: readonly Card[]): DiscordEmbed[] | undefined {
  assertCards(cards);
  const embeds = cards.map(toEmbed);
  if (embeds.length > CARD_LIMITS.cards) return undefined;
  if (!embeds.every(withinLimits)) return undefined;
  const total = embeds.reduce((n, e) => n + embedLength(e), 0);
  return total <= CARD_LIMITS.total ? embeds : undefined;
}

/** 카드 → 행 목록 마크다운(F1) — 한도를 넘었을 때의 대체. 글은 escape · 서식은 이 함수가 붙인다. */
export function cardsToMarkdown(cards: readonly Card[]): string {
  assertCards(cards);
  return cards
    .map((card) => {
      const lines: string[] = [];
      if (card.title) lines.push(`**${esc(card.title)}**`);
      const description = descOf(card);
      if (description !== '') lines.push(description);
      for (const f of card.fields ?? []) lines.push(`• **${esc(f.name)}** — ${esc(f.value)}`);
      if (card.footer) lines.push(`-# ${esc(card.footer)}`);
      return lines.join('\n');
    })
    .filter((s) => s !== '')
    .join('\n\n');
}

/**
 * 본문 + 카드 → 보낼 메시지 목록. 본문은 2000자 조각 · 카드는 마지막 조각에 · 본문이 비면 카드만.
 * 카드가 한도를 넘으면 행 목록으로 바꿔 본문 뒤에 잇고 경고를 남긴다. 보낼 것이 없으면 오류.
 */
export function planDiscordMessages(content: Content, logger: Logger): DiscordMessagePart[] {
  let md = toDiscordMarkdown(content.text, content.format);
  let embeds: DiscordEmbed[] | undefined;
  if (content.cards !== undefined) assertCards(content.cards); // 배열이 아닌 값을 조용히 무시하지 않는다(9-1 info)
  if (content.cards !== undefined && content.cards.length > 0) {
    embeds = toDiscordEmbeds(content.cards);
    if (embeds === undefined) {
      logger.warn(`[discord] 카드 ${content.cards.length}장이 embed 한도를 넘어 텍스트로 대체한다`);
      md = [md, cardsToMarkdown(content.cards)].filter((s) => s.trim() !== '').join('\n\n');
    }
  }
  const chunks = splitDiscordMarkdown(md, DISCORD_MAX_LENGTH).filter((c) => c.trim() !== '');
  if (chunks.length === 0 && embeds === undefined) throw new Error('@pleiades/notify: Discord 로 보낼 본문이 비었다');
  if (chunks.length === 0) return [{ embeds }];
  return chunks.map((c, i) => (i === chunks.length - 1 && embeds !== undefined ? { content: c, embeds } : { content: c }));
}
