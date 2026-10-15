import { describe, expect, it, vi } from 'vitest';
import { createDiscordBotTransport, toDiscordComponents } from './discord-bot';
import type { FetchLike, FetchResponseLike } from './discord';
import { html } from './types';

// 가짜 토큰 — 실제 형식(<id>.<ts>.<hmac>)을 흉내 내되 소스에 그 모양의 리터럴을 두지 않는다(push protection 오탐 · #149)
const TOKEN = ['MTIz' + '0'.repeat(20), 'Gabc' + 'DE', 'x'.repeat(30)].join('.');
const ok = (id: string): FetchResponseLike => ({ ok: true, status: 200, json: async () => ({ id }), text: async () => '' });

describe('toDiscordComponents — 텔레그램 inline_keyboard → Discord 버튼', () => {
  it('callback_data → Secondary(custom_id) · url → Link · 행 유지', () => {
    expect(
      toDiscordComponents({
        inline_keyboard: [
          [
            { text: '✅ 확정', callback_data: 'vest:confirm:r1' },
            { text: '✖️ 취소', callback_data: 'vest:cancel:r1' },
          ],
          [{ text: '웹', url: 'https://x.y/z' }],
          [],
        ],
      }),
    ).toEqual([
      {
        type: 1,
        components: [
          { type: 2, style: 2, label: '✅ 확정', custom_id: 'vest:confirm:r1' },
          { type: 2, style: 2, label: '✖️ 취소', custom_id: 'vest:cancel:r1' },
        ],
      },
      { type: 1, components: [{ type: 2, style: 5, label: '웹', url: 'https://x.y/z' }] },
    ]);
  });

  it('Discord 한도를 넘으면 자르지 않고 오류 — 버튼을 잃으면 할 일을 잃는다', () => {
    const btn = (i: number) => ({ text: `b${i}`, callback_data: `c${i}` });
    expect(() => toDiscordComponents({ inline_keyboard: [Array.from({ length: 6 }, (_, i) => btn(i))] })).toThrow('행당');
    expect(() => toDiscordComponents({ inline_keyboard: Array.from({ length: 6 }, (_, i) => [btn(i)]) })).toThrow('행은');
    expect(() => toDiscordComponents({ inline_keyboard: [[{ text: 'x', callback_data: 'c'.repeat(101) }]] })).toThrow('custom_id');
    expect(() => toDiscordComponents({ inline_keyboard: [[{ text: '', callback_data: 'c' }]] })).toThrow('버튼 이름');
    expect(() => toDiscordComponents({ inline_keyboard: [[{ text: 'x', url: 'javascript:1' }]] })).toThrow('callback_data');
    expect(() => toDiscordComponents({ foo: 1 })).toThrow('inline_keyboard');
  });
});

describe('createDiscordBotTransport', () => {
  function setup(responses: FetchResponseLike[] = []) {
    const queue = [...responses];
    const fetch = vi.fn<FetchLike>(async () => queue.shift() ?? ok('m'));
    const t = createDiscordBotTransport({ token: () => TOKEN, channels: { finance: '123456789012345678' }, fetch });
    const bodies = () => fetch.mock.calls.map((c) => JSON.parse(c[1].body as string) as Record<string, unknown>);
    return { t, fetch, bodies };
  }

  it('채널 ID 로 Bot 인증 POST · md 변환 · 멘션 차단 · 버튼 변환 · ref = 메시지 id', async () => {
    const { t, fetch, bodies } = setup([ok('777')]);
    const kb = { inline_keyboard: [[{ text: '✅ 확정', callback_data: 'vest:confirm:r1' }]] };
    await expect(t.send('finance', html('<b>D-day</b> RSU', kb))).resolves.toBe('777');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://discord.com/api/v10/channels/123456789012345678/messages');
    expect(init.headers).toEqual({ 'content-type': 'application/json', authorization: `Bot ${TOKEN}` });
    expect(bodies()[0]).toEqual({
      content: '**D-day** RSU',
      allowed_mentions: { parse: [] },
      components: [{ type: 1, components: [{ type: 2, style: 2, label: '✅ 확정', custom_id: 'vest:confirm:r1' }] }],
    });
  });

  it('긴 본문은 나누고 버튼은 마지막 청크에만', async () => {
    const { t, bodies } = setup([ok('a'), ok('b')]);
    const text = Array.from({ length: 40 }, (_, i) => `${i} ${'가'.repeat(80)}`).join('\n');
    const kb = { inline_keyboard: [[{ text: 'ok', callback_data: 'c' }]] };
    await expect(t.send('finance', html(text, kb))).resolves.toBe('b');
    expect(bodies()).toHaveLength(2);
    expect(bodies()[0].components).toBeUndefined();
    expect(bodies()[1].components).toBeDefined();
  });

  it('모르는 별칭 · 형식이 틀린 채널 ID · 빈 토큰은 보내지 않고 오류(값 비노출)', async () => {
    const fetch = vi.fn<FetchLike>();
    await expect(
      createDiscordBotTransport({ token: TOKEN, channels: { finance: '1' }, fetch }).send('fitness', html('x')),
    ).rejects.toThrow('(fitness)');
    await expect(
      createDiscordBotTransport({ token: TOKEN, channels: { finance: 'abc' }, fetch }).send('finance', html('x')),
    ).rejects.toThrow('형식이 틀린');
    await expect(
      createDiscordBotTransport({ token: ' ', channels: { finance: '123456789012345678' }, fetch }).send('finance', html('x')),
    ).rejects.toThrow('토큰이 없다');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('4xx 는 "Discord API 응답" 으로 실패 — 토큰·채널 ID 비노출', async () => {
    const res: FetchResponseLike = {
      ok: false,
      status: 403,
      json: async () => ({}),
      text: async () => JSON.stringify({ message: 'Missing Access', code: 50001 }),
    };
    const { t } = setup([res]);
    const err = await t.send('finance', html('x')).catch((e: unknown) => e);
    expect((err as Error).message).toBe('Discord API 응답 403: Missing Access (code 50001)');
    expect((err as Error).message).not.toContain(TOKEN);
  });
});
