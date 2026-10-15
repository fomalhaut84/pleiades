import { describe, expect, it, vi } from 'vitest';
import { createDiscordTransport, DiscordWebhookError, type FetchLike, type FetchResponseLike } from './discord';
import { createNotifier } from './notifier';
import { html, Route } from './types';

const URL_FIN = 'https://discord.com/api/webhooks/111/secret-token-fin';
const URL_FIT = 'https://discord.com/api/webhooks/222/secret-token-fit?thread_id=9';

function res(status: number, body: unknown): FetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function setup(responses: Array<FetchResponseLike | Error>) {
  const queue = [...responses];
  const fetch = vi.fn<FetchLike>(async () => {
    const next = queue.shift() ?? res(200, { id: 'fallback' });
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(async (_ms: number) => {});
  const logger = { warn: vi.fn(), error: vi.fn() };
  const transport = createDiscordTransport({
    webhooks: { finance: URL_FIN, fitness: URL_FIT },
    fetch,
    sleep,
    logger,
  });
  const bodies = () => fetch.mock.calls.map((c) => JSON.parse(c[1].body) as { content: string; allowed_mentions: unknown });
  return { transport, fetch, sleep, logger, bodies };
}

const netErr = () => Object.assign(new Error('fetch failed'), { cause: Object.assign(new Error('reset'), { code: 'ECONNRESET' }) });

describe('createDiscordTransport', () => {
  it('channel discord · maxLength Infinity (어댑터 소유 — 003 §4-3 제약 2)', () => {
    const { transport } = setup([]);
    expect(transport.channel).toBe('discord');
    expect(transport.maxLength).toBe(Number.POSITIVE_INFINITY);
  });

  it('별칭의 웹훅으로 wait=true POST · html 은 md 로 · 멘션 차단 · ref 는 메시지 id', async () => {
    const { transport, fetch, bodies } = setup([res(200, { id: '999' })]);
    await expect(transport.send('finance', html('<b>A &amp; B</b> @everyone'))).resolves.toBe('999');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(`${URL_FIN}?wait=true`);
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(bodies()[0]).toEqual({ content: '**A & B** @everyone', allowed_mentions: { parse: [] } });
  });

  it('웹훅 URL 에 쿼리가 있으면 & 로 잇는다', async () => {
    const { transport, fetch } = setup([res(200, { id: '1' })]);
    await transport.send('fitness', html('x'));
    expect(fetch.mock.calls[0][0]).toBe(`${URL_FIT}&wait=true`);
  });

  it('plain 은 글자 그대로 보이게 escape 한다', async () => {
    const { transport, bodies } = setup([res(200, { id: '1' })]);
    await transport.send('finance', { text: '*x* <b>', format: 'plain' });
    expect(bodies()[0].content).toBe('\\*x\\* \\<b>');
  });

  it('모르는 별칭 · 빈 URL 은 오류 — 메시지에 URL 이 없다', async () => {
    const { transport, fetch } = setup([]);
    await expect(transport.send('calendar', html('x'))).rejects.toThrow('(calendar)');
    expect(fetch).not.toHaveBeenCalled();
    const t2 = createDiscordTransport({ webhooks: { finance: '' }, fetch });
    await expect(t2.send('finance', html('x'))).rejects.toThrow('웹훅이 설정되지 않은');
  });

  it('프로토타입 키를 별칭으로 받지 않는다', async () => {
    const { transport } = setup([]);
    await expect(transport.send('toString', html('x'))).rejects.toThrow('(toString)');
  });

  it('webhooks 팩토리는 send 때마다 읽는다', async () => {
    const fetch = vi.fn<FetchLike>(async () => res(200, { id: '1' }));
    let map: Record<string, string> = {};
    const t = createDiscordTransport({ webhooks: () => map, fetch });
    await expect(t.send('finance', html('x'))).rejects.toThrow();
    map = { finance: URL_FIN };
    await expect(t.send('finance', html('x'))).resolves.toBe('1');
  });

  it('변환 뒤 2000자로 분할 · ref 는 마지막 청크 id', async () => {
    const line = 'ㄱ'.repeat(99);
    const text = Array.from({ length: 30 }, () => line).join('\n'); // 2999자
    const { transport, fetch, bodies } = setup([res(200, { id: 'c1' }), res(200, { id: 'c2' })]);
    await expect(transport.send('finance', html(text))).resolves.toBe('c2');
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const b of bodies()) expect(b.content.length).toBeLessThanOrEqual(2000);
    expect(bodies().map((b) => b.content).join('\n')).toBe(text);
  });

  it('분할은 HTML 이 아니라 변환 후 길이로 한다 — 태그로 부푼 HTML 이 한 메시지로 간다', async () => {
    // 모르는 태그는 벗겨진다 — HTML 3700자 · 변환 후 1100자 남짓
    const text = Array.from({ length: 100 }, () => `<span class="note">${'가'.repeat(10)}</span>`).join('\n');
    expect(text.length).toBeGreaterThan(2000);
    const { transport, fetch } = setup([res(200, { id: '1' })]);
    await transport.send('finance', html(text));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('components 는 지원하지 않는다 — 버튼을 조용히 버리지 않는다 (1b-2)', async () => {
    const { transport, fetch } = setup([]);
    await expect(transport.send('finance', html('x', { inline_keyboard: [] }))).rejects.toThrow('components');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('빈 본문은 보내지 않고 오류', async () => {
    const { transport, fetch } = setup([]);
    await expect(transport.send('finance', html('<b></b>\n\n'))).rejects.toThrow('비었다');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('네트워크 오류는 백오프로 재시도한다', async () => {
    const { transport, fetch, sleep, logger } = setup([netErr(), netErr(), res(200, { id: 'ok' })]);
    await expect(transport.send('finance', html('x'))).resolves.toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 8000]);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(String(logger.warn.mock.calls[0][0])).toContain('(finance');
    expect(String(logger.warn.mock.calls[0][0])).not.toContain('secret-token');
  });

  // 회귀: PR #142 Codex P2 — 헤더를 받은 뒤 본문 읽기에서 소켓이 끊겨도 재시도 예산을 쓴다
  it('2xx 본문 읽기 중 네트워크 오류도 재시도한다', async () => {
    const broken: FetchResponseLike = {
      ok: true,
      status: 200,
      json: async () => {
        throw Object.assign(new TypeError('terminated'), { cause: { code: 'UND_ERR_SOCKET' } });
      },
      text: async () => '',
    };
    const { transport, fetch } = setup([broken, res(200, { id: 'ok' })]);
    await expect(transport.send('finance', html('x'))).resolves.toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('오류 응답(429) 본문 읽기 중 끊겨도 재시도한다 — retry_after 를 잃지 않는다', async () => {
    const broken: FetchResponseLike = {
      ok: false,
      status: 429,
      json: async () => ({}),
      text: async () => {
        throw Object.assign(new TypeError('terminated'), { cause: { code: 'UND_ERR_SOCKET' } });
      },
    };
    const { transport, fetch } = setup([broken, res(429, { retry_after: 0.5 }), res(200, { id: 'ok' })]);
    await expect(transport.send('finance', html('x'))).resolves.toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('2xx 본문이 JSON 이 아니면 재시도하지 않고 실패한다', async () => {
    const bad: FetchResponseLike = {
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
      text: async () => 'x',
    };
    const { transport, fetch } = setup([bad]);
    await expect(transport.send('finance', html('x'))).rejects.toThrow('Unexpected token');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('undici 연결 타임아웃 코드도 네트워크 오류로 본다', async () => {
    const undici = Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
    const { transport, fetch } = setup([undici, res(200, { id: 'ok' })]);
    await expect(transport.send('finance', html('x'))).resolves.toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('재시도 예산(총 4회)을 넘으면 마지막 오류를 올린다', async () => {
    const { transport, fetch } = setup([netErr(), netErr(), netErr(), netErr()]);
    await expect(transport.send('finance', html('x'))).rejects.toThrow('fetch failed');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('네트워크가 아닌 예외는 재시도하지 않는다', async () => {
    const { transport, fetch } = setup([new Error('boom')]);
    await expect(transport.send('finance', html('x'))).rejects.toThrow('boom');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('429 는 retry_after 만큼 기다려 다시 보낸다 — 네트워크 재시도 예산을 쓰지 않는다', async () => {
    const { transport, fetch, sleep } = setup([res(429, { retry_after: 1.2 }), res(200, { id: 'ok' })]);
    await expect(transport.send('finance', html('x'))).resolves.toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1200);
  });

  it('429 의 대기가 상한을 넘거나 반복되면 실패로 올린다', async () => {
    const long = setup([res(429, { retry_after: 60 })]);
    await expect(long.transport.send('finance', html('x'))).rejects.toBeInstanceOf(DiscordWebhookError);
    expect(long.sleep).not.toHaveBeenCalled();

    const repeated = setup([res(429, { retry_after: 0.1 }), res(429, { retry_after: 0.1 }), res(429, { retry_after: 0.1 })]);
    await expect(repeated.transport.send('finance', html('x'))).rejects.toThrow('응답 429');
    expect(repeated.fetch).toHaveBeenCalledTimes(3);
  });

  it('4xx 는 상태·Discord 메시지로 실패 — URL 은 담지 않는다', async () => {
    const { transport } = setup([res(404, { message: 'Unknown Webhook', code: 10015 })]);
    const err = await transport.send('finance', html('x')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DiscordWebhookError);
    expect((err as DiscordWebhookError).status).toBe(404);
    expect((err as Error).message).toBe('Discord webhook 응답 404: Unknown Webhook (code 10015)');
    expect((err as Error).message).not.toContain('secret-token');
  });

  // 회귀: #141 사전 리뷰 info — 429 본문을 읽은 뒤에도 오류 상세가 남는다(본문 이중 소비 없음)
  it('429 가 상한을 넘으면 Discord 메시지를 담아 실패한다', async () => {
    const r429: FetchResponseLike = {
      ok: false,
      status: 429,
      json: async () => ({ message: 'You are being rate limited.', retry_after: 60 }),
      text: vi.fn(async () => JSON.stringify({ message: 'You are being rate limited.', retry_after: 60 })),
    };
    const { transport } = setup([r429]);
    await expect(transport.send('finance', html('x'))).rejects.toThrow('응답 429: You are being rate limited.');
    expect(r429.text).toHaveBeenCalledTimes(1);
  });

  it('2xx 인데 id 가 없으면 실패', async () => {
    const { transport } = setup([res(200, {})]);
    await expect(transport.send('finance', html('x'))).rejects.toThrow('메시지 id');
  });
});

describe('Notifier + DiscordTransport (어댑터 소유 모드)', () => {
  it('Route → 채널 별칭 · 코어는 send 를 한 번만 부르고 재시도하지 않는다', async () => {
    const fetch = vi.fn<FetchLike>(async () => res(500, 'oops'));
    const logger = { warn: vi.fn(), error: vi.fn() };
    const notifier = createNotifier({
      transport: createDiscordTransport({ webhooks: { finance: URL_FIN }, fetch, logger }),
      targets: { ALLOWED: () => ['finance'] },
      logger,
      sleep: async () => {},
    });
    const r = await notifier.notify(Route.ALLOWED, html('<b>x</b>'), { label: 'fin' });
    expect(r).toMatchObject({ sent: 0, failed: 1, total: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(r.deliveries[0].error).toBe('Discord webhook 응답 500: oops');
    expect(String(logger.error.mock.calls[0][0])).toContain('[fin] 메시지 전송 실패 (finance)');
  });

  it('텔레그램과 Discord 를 Route 별로 섞어 쓸 수 있다 (Q11 혼합 운영)', async () => {
    const fetch = vi.fn<FetchLike>(async () => res(200, { id: 'd1' }));
    const sendMessage = vi.fn(async () => ({ message_id: 7 }));
    const { createTelegramTransport } = await import('./telegram');
    const notifier = createNotifier({
      transport: {
        ALLOWED: createDiscordTransport({ webhooks: { finance: URL_FIN }, fetch }),
        ADMIN: createTelegramTransport({ api: { sendMessage } }),
      },
      targets: { ALLOWED: () => ['finance'], ADMIN: () => ['42'] },
    });
    await expect(notifier.notify(Route.ALLOWED, html('<b>a</b>'))).resolves.toMatchObject({ sent: 1, first: { ref: 'd1' } });
    await expect(notifier.notify(Route.ADMIN, html('<b>a</b>'))).resolves.toMatchObject({ sent: 1, first: { ref: '7' } });
    expect(sendMessage).toHaveBeenCalledWith('42', '<b>a</b>', { parse_mode: 'HTML' });
  });
});
