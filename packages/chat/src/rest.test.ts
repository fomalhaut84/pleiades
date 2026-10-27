import { describe, expect, it, vi } from 'vitest';
import { toAttachment, typeAllowed } from './attachments';
import { createRest, type ChatFetch, type ChatResponse } from './rest';

const TOKEN = ['MTIz' + '0'.repeat(20), 'Gabc' + 'DE', 'x'.repeat(30)].join('.');
const CH = '222222222222222222';

const res = (status: number, body: unknown = { id: 'm1' }): ChatResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

function setup(handler?: (url: string) => ChatResponse) {
  let n = 0;
  const fetch = vi.fn<ChatFetch>(async (url) => handler?.(url) ?? res(200, { id: `m${++n}` }));
  const logger = { warn: vi.fn(), error: vi.fn() };
  const rest = createRest({ token: () => TOKEN, fetch, logger, retryDelaysMs: [], sleep: async () => {} });
  const calls = () =>
    fetch.mock.calls.map(([url, init]) => ({
      url,
      method: init.method,
      auth: init.headers.authorization,
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined,
    }));
  return { rest, fetch, calls, logger };
}

describe('rest.send — 2000자를 넘어도 잃지 않는다 (R1 · 0-3)', () => {
  it('나눠 보내고 버튼은 마지막 조각에만 · 돌려준 id 는 마지막 메시지', async () => {
    const { rest, calls } = setup();
    const text = '가'.repeat(4500);
    const sent = await rest.send(CH, { text, buttons: [[{ label: '확인', action: 'ok' }]] });
    const c = calls();
    expect(c).toHaveLength(3);
    expect(c.every((x) => x.url.endsWith(`/channels/${CH}/messages`) && x.method === 'POST')).toBe(true);
    expect(c.map((x) => (x.body?.content as string).length).reduce((a, b) => a + b, 0)).toBe(4500);
    expect(c.slice(0, 2).every((x) => x.body?.components === undefined)).toBe(true);
    expect(c[2].body?.components).toEqual([{ type: 1, components: [{ type: 2, style: 2, label: '확인', custom_id: 'ok' }] }]);
    expect(c.every((x) => JSON.stringify(x.body?.allowed_mentions) === '{"parse":[]}')).toBe(true);
    expect(c[0].auth).toBe(`Bot ${TOKEN}`);
    expect(sent.id).toBe('m3');
    expect(sent.channelId).toBe(CH);
  });
  it('문자열은 plain — 마크다운 기호를 escape 한다 · html 은 변환', async () => {
    const { rest, calls } = setup();
    await rest.send(CH, '*굵게 아님*');
    await rest.send(CH, { text: '<b>굵게</b>', format: 'html' });
    expect(calls()[0].body?.content).toBe('\\*굵게 아님\\*');
    expect(calls()[1].body?.content).toBe('**굵게**');
  });
  it('빈 본문 · 잘못된 채널 ID · 빈 토큰은 보내지 않고 던진다', async () => {
    const { rest, fetch } = setup();
    await expect(rest.send(CH, '   ')).rejects.toThrow(/비었다/);
    await expect(rest.send('abc', 'x')).rejects.toThrow(/채널 ID/);
    const empty = createRest({ token: () => ' ', fetch, retryDelaysMs: [] });
    await expect(empty.send(CH, 'x')).rejects.toThrow(/토큰이 없다/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('오류 메시지에 토큰이 없다', async () => {
    const { rest } = setup(() => res(403, { message: 'Missing Access', code: 50001 }));
    const err = (await rest.send(CH, 'x').catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/403/);
    expect(err.message).not.toContain(TOKEN);
  });
});

describe('rest.edit / setButtons — 인터랙션 밖 편집 · 버튼 교체 (R3 · 0-3)', () => {
  it('한 조각 편집 — PATCH 1회 · 버튼을 주지 않으면 components 를 건드리지 않는다', async () => {
    const { rest, calls } = setup();
    await rest.edit(CH, 'm9', '바뀐 본문');
    expect(calls()).toEqual([
      expect.objectContaining({ url: expect.stringMatching(new RegExp(`/channels/${CH}/messages/m9$`)), method: 'PATCH' }),
    ]);
    expect(calls()[0].body).not.toHaveProperty('components');
  });
  it('긴 편집 — 원본을 첫 조각으로 · 나머지는 새 메시지 · 버튼은 마지막 새 메시지에(원본 버튼 지움)', async () => {
    const { rest, calls } = setup();
    await rest.edit(CH, 'm9', { text: 'a'.repeat(3000), buttons: [[{ label: 'b', action: 'b' }]] });
    const c = calls();
    expect(c.map((x) => x.method)).toEqual(['PATCH', 'POST']);
    expect(c[0].body?.components).toEqual([]);
    expect(c[1].body?.components).toHaveLength(1);
    expect((c[0].body?.content as string).length + (c[1].body?.content as string).length).toBe(3000);
  });
  it('setButtons([]) 는 버튼만 지운다 · SentMessage 로도 같다', async () => {
    const { rest, calls } = setup();
    const sent = await rest.send(CH, 'x');
    await sent.setButtons([]);
    await sent.edit({ text: 'y', buttons: [[{ label: 'z', action: 'z' }]] });
    const c = calls();
    expect(c[1]).toMatchObject({ method: 'PATCH', body: { components: [] } });
    expect(c[2].body?.components).toHaveLength(1);
  });
  it('인터랙션 원본 편집은 봇 토큰을 싣지 않는다', async () => {
    const { rest, calls } = setup();
    await rest.editOriginal('https://discord.com/api/v10/webhooks/app/itok', CH, 'x');
    expect(calls()[0]).toMatchObject({ url: 'https://discord.com/api/v10/webhooks/app/itok/messages/@original', method: 'PATCH', auth: undefined });
  });
});

describe('rest.sendFile — 봇 경로 파일 (0-3)', () => {
  it('multipart 로 보낸다 · 상한을 넘으면 보내지 않는다', async () => {
    const { fetch } = setup();
    const rest = createRest({ token: () => TOKEN, fetch, retryDelaysMs: [], maxFileBytes: 4 });
    const sent = await rest.sendFile(CH, { name: 'r.pdf', data: new Uint8Array([1, 2, 3]), caption: '보고서' });
    expect(sent.id).toBe('m1');
    const init = fetch.mock.calls[0][1];
    expect(init.headers.authorization).toBe(`Bot ${TOKEN}`);
    expect(init.headers['content-type']).toBeUndefined(); // boundary 는 fetch 가 붙인다
    expect(typeof init.body).not.toBe('string');
    await expect(rest.sendFile(CH, { name: 'big', data: new Uint8Array(5) })).rejects.toThrow(/상한/);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('rest.gatewayBot — 남은 IDENTIFY (U-15)', () => {
  it('session_start_limit 을 읽는다 · GET 에 본문이 없다', async () => {
    const { rest, fetch } = setup(() => res(200, { session_start_limit: { total: 1000, remaining: 987, reset_after: 5000, max_concurrency: 1 } }));
    expect(await rest.gatewayBot()).toEqual({ total: 1000, remaining: 987, resetAfterMs: 5000 });
    const init = fetch.mock.calls[0][1];
    expect(init).toMatchObject({ method: 'GET', headers: { authorization: `Bot ${TOKEN}` } });
    expect(init.body).toBeUndefined();
    expect(init.signal).toBeDefined(); // 회귀: #332 사전 리뷰 info 4 — IDENTIFY 를 붙잡지 않는 상한
  });
  it('실패·형식 이상이면 undefined(로컬 기록만으로 판단)', async () => {
    expect(await setup(() => res(500)).rest.gatewayBot()).toBeUndefined();
    expect(await setup(() => res(200, {})).rest.gatewayBot()).toBeUndefined();
  });
});

describe('첨부 수신 — 크기·형식·출처 검증 (0-3 · R6)', () => {
  const policy = { maxBytes: 10, allowedTypes: ['image/'] };
  const raw = (over: Record<string, unknown> = {}) => ({
    id: 'a1',
    filename: 'p.jpg',
    size: 5,
    content_type: 'image/jpeg',
    url: 'https://cdn.discordapp.com/attachments/1/2/p.jpg?ex=1',
    ...over,
  });
  const streamRes = (chunks: Uint8Array[], headers: Record<string, string> = {}) => {
    const cancel = vi.fn(async () => {});
    let i = 0;
    const r: ChatResponse = {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
      headers: { get: (k) => headers[k.toLowerCase()] ?? null },
      body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }), cancel }) },
    };
    return { r, cancel };
  };

  it('typeAllowed: 정확히 · 접두 · 매개변수 무시 · 모르면 거부', () => {
    expect(typeAllowed('image/png; charset=x', ['image/png'])).toBe(true);
    expect(typeAllowed('IMAGE/WEBP', ['image/'])).toBe(true);
    expect(typeAllowed('application/pdf', ['image/'])).toBe(false);
    expect(typeAllowed(undefined, ['image/'])).toBe(false);
  });
  it('정상 — 조각을 이어 붙여 돌려준다', async () => {
    const { r } = streamRes([new Uint8Array([1, 2]), new Uint8Array([3])]);
    const fetch = vi.fn<ChatFetch>(async () => r);
    const a = toAttachment(raw(), policy, () => fetch);
    expect(Array.from(await a.download())).toEqual([1, 2, 3]);
    expect(a).toMatchObject({ id: 'a1', name: 'p.jpg', size: 5, contentType: 'image/jpeg' });
    expect(fetch.mock.calls[0][1]).toEqual({ method: 'GET', headers: {} });
  });
  it('받는 도중 상한을 넘으면 끊는다(플랫폼 크기가 작게 와도)', async () => {
    const { r, cancel } = streamRes([new Uint8Array(6), new Uint8Array(6), new Uint8Array(6)]);
    const a = toAttachment(raw({ size: 3 }), policy, () => async () => r);
    await expect(a.download()).rejects.toThrow(/받는 중/);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('형식 · 알려진 크기 · content-length · 출처가 틀리면 내려받지 않는다', async () => {
    const fetch = vi.fn<ChatFetch>(async () => streamRes([], { 'content-length': '999' }).r);
    await expect(toAttachment(raw({ content_type: 'application/x-msdownload' }), policy, () => fetch).download()).rejects.toThrow(/형식/);
    await expect(toAttachment(raw({ size: 11 }), policy, () => fetch).download()).rejects.toThrow(/상한/);
    await expect(toAttachment(raw({ size: 'x' }), policy, () => fetch).download()).rejects.toThrow(/크기 모름/);
    await expect(toAttachment(raw({ url: 'https://evil.example/p.jpg' }), policy, () => fetch).download()).rejects.toThrow(/CDN/);
    await expect(toAttachment(raw({ url: 'http://cdn.discordapp.com/p.jpg' }), policy, () => fetch).download()).rejects.toThrow(/CDN/);
    expect(fetch).not.toHaveBeenCalled();
    await expect(toAttachment(raw(), policy, () => fetch).download()).rejects.toThrow(/999/);
  });
  it('거부한 응답(content-length 초과 · 실패 상태)의 본문을 닫는다', async () => {
    // 회귀: PR #334 Codex P2 (거부한 내려받기가 연결을 붙잡는다)
    const big = streamRes([new Uint8Array(1)], { 'content-length': '999' });
    await expect(toAttachment(raw(), policy, () => async () => big.r).download()).rejects.toThrow(/999/);
    expect(big.cancel).toHaveBeenCalledOnce();
    const bad = streamRes([]);
    const failed = { ...bad.r, ok: false, status: 404 };
    await expect(toAttachment(raw(), policy, () => async () => failed).download()).rejects.toThrow(/404/);
    expect(bad.cancel).toHaveBeenCalledOnce();
  });
});
