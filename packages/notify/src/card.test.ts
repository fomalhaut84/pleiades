import { describe, expect, it, vi } from 'vitest';
import { CARD_LIMITS, cardRowList, cardsToMarkdown, planDiscordMessages, toDiscordEmbeds } from './card';
import { html, markdown, type Card } from './types';

// 013 P3-a1 (#773) — 카드(Discord embed) 변환 · 한도 · 텍스트 대체

const silent = { warn: vi.fn(), error: vi.fn() };

describe('toDiscordEmbeds — 모양', () => {
  it('제목 · 설명 · 필드 · 색 · 꼬리말을 embed 로 옮긴다', () => {
    const card: Card = {
      title: '포트폴리오',
      description: '평가 기준 15:40',
      fields: [
        { name: 'AAPL', value: '+1.2%', inline: true },
        { name: 'MSFT', value: '-0.4%' },
      ],
      color: 0xe03131,
      footer: '출처 yahoo',
    };
    expect(toDiscordEmbeds([card])).toEqual([
      {
        title: '포트폴리오',
        description: '평가 기준 15:40',
        fields: [
          { name: 'AAPL', value: '\\+1.2%', inline: true },
          { name: 'MSFT', value: '\\-0.4%' },
        ],
        color: 0xe03131,
        footer: { text: '출처 yahoo' },
      },
    ]);
  });

  it('카드 글은 plain — 외부 값의 서식 문자를 escape 한다(013 §4-0)', () => {
    const [e] = toDiscordEmbeds([{ title: '**굵게**', fields: [{ name: '`x`', value: '[a](https://e.test)' }] }]) ?? [];
    expect(e.title).toBe('\\*\\*굵게\\*\\*');
    expect(e.fields?.[0].name).toBe('\\`x\\`');
    expect(e.fields?.[0].value).not.toContain('[a](');
  });

  it('빈 필드 이름 · 값은 폭 없는 공백으로 — Discord 는 빈 칸을 400 으로 거부한다', () => {
    const [e] = toDiscordEmbeds([{ fields: [{ name: '', value: '' }] }]) ?? [];
    expect(e.fields).toEqual([{ name: '​', value: '​' }]);
  });

  // 회귀: P3-a1 9-1 major — 꼬리말 칸은 마크다운을 렌더링하지 않아 escape 가 글자로 보인다
  it('embed 꼬리말은 원문 그대로 · 행 목록 대체에서는 escape', () => {
    const card: Card = { title: 't', footer: '출처 yahoo_finance <KRX>' };
    expect(toDiscordEmbeds([card])?.[0].footer).toEqual({ text: '출처 yahoo_finance <KRX>' });
    expect(cardsToMarkdown([card])).toBe('**t**\n-# 출처 yahoo\\_finance \\<KRX>');
  });

  it('cards 가 배열이 아니면 조용히 무시하지 않고 오류', () => {
    expect(() => planDiscordMessages({ ...html('x'), cards: {} as unknown as Card[] }, silent)).toThrow('배열');
  });

  it('빈 title · description · footer 는 빼고 보낸다', () => {
    expect(toDiscordEmbeds([{ title: '', description: '본문', footer: '' }])).toEqual([{ description: '본문' }]);
  });

  it('보일 것이 없는 카드 · 잘못된 색 · 배열 아닌 입력은 오류다(조용히 버리지 않는다)', () => {
    expect(() => toDiscordEmbeds([{}])).toThrow('빈 카드');
    expect(() => toDiscordEmbeds([{ title: '', fields: [] }])).toThrow('빈 카드');
    expect(() => toDiscordEmbeds([{ title: 't', color: -1 }])).toThrow('색');
    expect(() => toDiscordEmbeds([{ title: 't', color: 0x1000000 }])).toThrow('색');
    expect(() => toDiscordEmbeds([{ title: 't', color: 1.5 }])).toThrow('색');
    expect(() => toDiscordEmbeds('x' as unknown as Card[])).toThrow('배열');
  });
});

describe('toDiscordEmbeds — 한도(013 R9)', () => {
  const field = { name: 'n', value: 'v' };
  it('한도 안이면 embed · 넘으면 undefined(텍스트 대체 신호)', () => {
    expect(toDiscordEmbeds([{ fields: Array(CARD_LIMITS.fields).fill(field) }])).toBeDefined();
    expect(toDiscordEmbeds([{ fields: Array(CARD_LIMITS.fields + 1).fill(field) }])).toBeUndefined();
    expect(toDiscordEmbeds(Array(CARD_LIMITS.cards).fill({ title: 't' }))).toBeDefined();
    expect(toDiscordEmbeds(Array(CARD_LIMITS.cards + 1).fill({ title: 't' }))).toBeUndefined();
  });

  it.each([
    ['title', { title: 'a'.repeat(CARD_LIMITS.title + 1) }],
    ['description', { description: 'a'.repeat(CARD_LIMITS.description + 1) }],
    ['footer', { title: 't', footer: 'a'.repeat(CARD_LIMITS.footer + 1) }],
    ['field name', { fields: [{ name: 'a'.repeat(CARD_LIMITS.fieldName + 1), value: 'v' }] }],
    ['field value', { fields: [{ name: 'n', value: 'a'.repeat(CARD_LIMITS.fieldValue + 1) }] }],
  ] as const)('%s 한도를 넘으면 undefined', (_, card) => {
    expect(toDiscordEmbeds([card as Card])).toBeUndefined();
  });

  it('한도는 escape 뒤 길이로 잰다 — escape 가 늘린 글자도 센다', () => {
    const exact = '*'.repeat(CARD_LIMITS.title / 2); // escape 뒤 정확히 한도
    expect(toDiscordEmbeds([{ title: exact }])).toBeDefined();
    expect(toDiscordEmbeds([{ title: exact + '*' }])).toBeUndefined();
  });

  it('메시지 전체 합 6000 — 카드마다 한도 안이어도 합이 넘으면 undefined', () => {
    const big = { description: 'a'.repeat(2000) };
    expect(toDiscordEmbeds([big, big, big])).toBeDefined(); // 6000
    expect(toDiscordEmbeds([big, big, big, { title: 'x' }])).toBeUndefined(); // 6001
  });
});

// 013 P3-a2 (#775) · F8 — 설명 칸 행 목록 · 행 이름 굵게(사용자 2026-11-18)
describe('cardRowList · descriptionFormat markdown', () => {
  it('행 이름은 굵게 · 외부 값(이름 · 값)은 escape', () => {
    expect(cardRowList([{ label: '삼성전자', text: '₩7,120,000 · +2.31%' }, { label: 'a_b*', text: '<@1> [x](https://e.test)' }])).toEqual({
      description: '• **삼성전자** — ₩7,120,000 · +2.31%\n• **a\\_b\\*** — \\<@1> \\[x\\](https://e.test)',
      descriptionFormat: 'markdown',
    });
  });

  it('embed 설명 — markdown 이면 서식이 살고 외부 값의 서식 문자는 escape 된 채', () => {
    const card = { title: '보유', ...cardRowList([{ label: 'a_b', text: '-1.2% <@1>' }]) };
    const [e] = toDiscordEmbeds([card]) ?? [];
    expect(e.description).toMatch(/^• \*\*a\\_b\*\* — /);
    expect(e.description).not.toContain('<@1>'); // `<` 는 escape(그리고 정리기가 폭 없는 공백까지)
  });

  it('plain(기본)은 그대로 escape — 기존 동작', () => {
    expect(toDiscordEmbeds([{ description: '**x**' }])?.[0].description).toBe('\\*\\*x\\*\\*');
  });

  it('행 목록 대체 글에도 같은 서식', () => {
    const card = { title: '보유', ...cardRowList([{ label: 'AAPL', text: '10주' }]) };
    expect(cardsToMarkdown([card])).toBe('**보유**\n• **AAPL** — 10주');
  });

  it('행이 없으면 빈 설명 — 빈 카드 판정은 그대로', () => {
    expect(cardRowList([])).toEqual({ description: '', descriptionFormat: 'markdown' });
    expect(() => toDiscordEmbeds([{ ...cardRowList([]) }])).toThrow('빈 카드');
  });
});

describe('cardsToMarkdown — 텍스트 대체(F1 행 목록)', () => {
  it('제목 굵게 · 설명 · 필드는 행 목록 · 꼬리말은 작은 글씨', () => {
    expect(
      cardsToMarkdown([{ title: '보유', description: '요약', fields: [{ name: 'AAPL', value: '10주' }], footer: '15:40' }]),
    ).toBe('**보유**\n요약\n• **AAPL** — 10주\n-# 15:40');
  });

  it('외부 값은 escape · 카드 사이는 빈 줄', () => {
    expect(cardsToMarkdown([{ title: 'a_b' }, { fields: [{ name: '*', value: '<@1>' }] }])).toBe(
      '**a\\_b**\n\n• **\\*** — \\<@1>',
    );
  });
});

describe('planDiscordMessages — 조각 + 카드', () => {
  const card: Card = { title: '보유', fields: [{ name: 'AAPL', value: '10주', inline: true }] };

  it('카드는 마지막 조각에만 붙는다', () => {
    const long = 'a'.repeat(1500) + '\n\n' + 'b'.repeat(1500);
    const parts = planDiscordMessages({ ...markdown(long), cards: [card] }, silent);
    expect(parts).toHaveLength(2);
    expect(parts[0].embeds).toBeUndefined();
    expect(parts[1].embeds).toHaveLength(1);
  });

  it('본문 없이 카드만 있어도 보낸다 — content 없이 embed 만', () => {
    const parts = planDiscordMessages({ ...html(''), cards: [card] }, silent);
    expect(parts).toEqual([{ embeds: toDiscordEmbeds([card]) }]);
  });

  it('카드가 없으면 전과 같다 — 본문 조각만', () => {
    expect(planDiscordMessages(markdown('안녕'), silent)).toEqual([{ content: '안녕' }]);
  });

  it('본문도 카드도 없으면 오류', () => {
    expect(() => planDiscordMessages(html('  '), silent)).toThrow('비었다');
    expect(() => planDiscordMessages({ ...html(''), cards: [] }, silent)).toThrow('비었다');
  });

  it('한도를 넘으면 카드를 행 목록 텍스트로 바꿔 본문 뒤에 잇고 경고를 남긴다', () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const over: Card = { title: '많음', fields: Array(CARD_LIMITS.fields + 1).fill({ name: 'n', value: 'v' }) };
    const parts = planDiscordMessages({ ...markdown('머리'), cards: [over] }, logger);
    expect(parts.every((p) => p.embeds === undefined)).toBe(true);
    const text = parts.map((p) => p.content).join('\n');
    expect(text.startsWith('머리\n\n**많음**\n• **n** — v')).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('텍스트로 대체'));
  });
});
