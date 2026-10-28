/**
 * 009 D-2 PR-1 (#362) — chat 확장: 메시지 채널 분리(Ka3) · 채널 대기열(Q3) · 4014 강등(F1) · typing·delete·sentAt(C).
 * 설계 정본 `_workspace/009/d2/02_writer_d2_r3.md` §4.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChat, messageSentAt, type ChatOptions } from './chat';
import { MESSAGE_INTENTS, type WebSocketLike } from './gateway';
import type { ChatFetch, ChatResponse } from './rest';
import { createRouter, type Router } from './router';

const TOKEN = ['MTIz' + '0'.repeat(20), 'Gabc' + 'DE', 'x'.repeat(30)].join('.');
const USER = '111111111111111111';
const CHAT_CH = '222222222222222222';
const ALERT_CH = '444444444444444444';

class FakeSocket implements WebSocketLike {
  readonly sent: Array<{ op: number; d?: Record<string, unknown> }> = [];
  private handlers: Record<string, Array<(...a: unknown[]) => void>> = {};
  on(event: string, fn: (...a: unknown[]) => void): void {
    (this.handlers[event] ??= []).push(fn);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as { op: number; d?: Record<string, unknown> });
  }
  close(): void {}
  terminate(): void {}
  emit(event: string, ...args: unknown[]): void {
    for (const fn of this.handlers[event] ?? []) fn(...args);
  }
  serverSends(p: { op: number; d?: unknown; s?: number; t?: string }): void {
    this.emit('message', Buffer.from(JSON.stringify(p)));
  }
  identifies(): Array<Record<string, unknown> | undefined> {
    return this.sent.filter((p) => p.op === 2).map((p) => p.d);
  }
}

const ok = (body: unknown = { id: 'm1' }): ChatResponse => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const tick = (ms = 20): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 손으로 여는 약속 — 핸들러를 붙잡아 두는 데 쓴다. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open = (): void => {};
  const wait = new Promise<void>((r) => (open = r));
  return { wait, open };
}

function setup(router: Router, over: Partial<ChatOptions> & { fetchImpl?: ChatFetch } = {}) {
  const sockets: FakeSocket[] = [];
  const fetch = vi.fn<ChatFetch>(over.fetchImpl ?? (async () => ok()));
  const logger = { warn: vi.fn(), error: vi.fn() };
  const { fetchImpl: _ignored, ...opts } = over;
  const chat = createChat({
    token: () => TOKEN,
    router,
    allowedUserIds: () => [USER],
    allowedChannelIds: () => [ALERT_CH, CHAT_CH],
    messageChannelIds: () => [CHAT_CH],
    label: 'discord-fit',
    logger,
    fetch,
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    reconnectDelaysMs: [5],
    retryDelaysMs: [],
    sleep: async () => {},
    identifyGuard: 'none',
    ...opts,
  });
  const last = (): FakeSocket => sockets[sockets.length - 1];
  const calls = () =>
    fetch.mock.calls.map(([url, init]) => ({ url, method: init.method, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined }));
  const hello = async (): Promise<void> => {
    last().serverSends({ op: 10, d: { heartbeat_interval: 41250 } });
    await flush();
  };
  const ready = async (): Promise<void> => {
    chat.start();
    await hello();
    last().serverSends({ op: 0, t: 'READY', s: 1, d: { session_id: 's1', resume_gateway_url: 'wss://resume.example' } });
  };
  return { chat, sockets, last, fetch, logger, calls, hello, ready };
}

let seq = 10;
const message = (over: Record<string, unknown> = {}) => ({
  op: 0,
  t: 'MESSAGE_CREATE',
  s: seq++,
  d: { id: 'msg1', channel_id: CHAT_CH, content: '안녕', type: 0, author: { id: USER }, attachments: [], ...over },
});
const press = (over: Record<string, unknown> = {}) => ({
  op: 0,
  t: 'INTERACTION_CREATE',
  s: seq++,
  d: {
    id: 'i1',
    token: 'itok',
    application_id: 'app1',
    type: 3,
    channel_id: CHAT_CH,
    data: { custom_id: 'food:edit', component_type: 2 },
    member: { user: { id: USER } },
    message: { id: 'm7' },
    ...over,
  },
});

beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
afterEach(() => vi.restoreAllMocks());

describe('메시지 채널 분리 (Ka3)', () => {
  it('알림 채널의 메시지는 무시하고 기록도 남기지 않는다 · 버튼은 알림 채널에서도 받는다', async () => {
    const onText = vi.fn(async () => {});
    const onBtn = vi.fn(async () => {});
    const { last, logger, ready } = setup(createRouter().fallback(onText).action('food:', onBtn));
    await ready();
    last().serverSends(message({ channel_id: ALERT_CH }));
    last().serverSends(message({ channel_id: ALERT_CH, author: { id: '333333333333333333' } }));
    last().serverSends(message());
    last().serverSends(press({ channel_id: ALERT_CH }));
    await flush();
    expect(onText).toHaveBeenCalledOnce();
    expect(onBtn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls.flat().join('\n')).not.toMatch(/허용되지 않은 사용자/);
  });

  it('messageChannelIds 가 없으면 버튼 채널과 같다(D-0 호환)', async () => {
    const onText = vi.fn(async () => {});
    const { last, ready } = setup(createRouter().fallback(onText), { messageChannelIds: undefined });
    await ready();
    last().serverSends(message({ channel_id: ALERT_CH }));
    await flush();
    expect(onText).toHaveBeenCalledOnce();
  });

  it('메시지 채널을 비우면 다음 메시지부터 무시한다(재시작 없음 · Kb1 의 토대)', async () => {
    let chans = [CHAT_CH];
    const onText = vi.fn(async () => {});
    const { last, ready } = setup(createRouter().fallback(onText), { messageChannelIds: () => chans });
    await ready();
    last().serverSends(message());
    await flush();
    chans = [];
    last().serverSends(message());
    await flush();
    expect(onText).toHaveBeenCalledOnce();
  });
});

describe('채널 대기열 (Q3)', () => {
  it('같은 채널 메시지는 받은 순서대로 하나씩 · 다른 채널은 겹친다', async () => {
    const g = gate();
    const order: string[] = [];
    const r = createRouter().fallback(async (ctx) => {
      order.push(`start:${ctx.text}`);
      if (ctx.text === 'A') await g.wait;
      order.push(`end:${ctx.text}`);
    });
    const other = '555555555555555555';
    const { last, ready } = setup(r, { messageChannelIds: () => [CHAT_CH, other], allowedChannelIds: () => [CHAT_CH, other] });
    await ready();
    last().serverSends(message({ content: 'A' }));
    last().serverSends(message({ content: 'B' }));
    last().serverSends(message({ content: 'C', channel_id: other }));
    await flush();
    expect(order).toEqual(['start:A', 'start:C', 'end:C']);
    g.open();
    await flush();
    expect(order).toEqual(['start:A', 'start:C', 'end:C', 'end:A', 'start:B', 'end:B']);
  });

  it('버튼 ack 는 대기열이 막혀도 즉시 · 버튼 핸들러는 같은 채널 앞 메시지 뒤', async () => {
    const g = gate();
    const order: string[] = [];
    const r = createRouter()
      .fallback(async () => {
        order.push('msg');
        await g.wait;
      })
      .action('food:', async () => void order.push('btn'));
    const { last, calls, ready } = setup(r);
    await ready();
    last().serverSends(message());
    last().serverSends(press());
    await flush();
    expect(calls().some((c) => c.url.endsWith('/interactions/i1/itok/callback') && c.body?.type === 6)).toBe(true);
    expect(order).toEqual(['msg']);
    g.open();
    await flush();
    expect(order).toEqual(['msg', 'btn']);
  });

  // 회귀: PR #361 Codex P2 — ack 를 기다리는 사이 뒤 메시지가 앞지르면 편집 pending 전에 숫자가 처리된다
  it('ack 가 늦어도 버튼 → 메시지 순서를 지킨다', async () => {
    const ackGate = gate();
    const order: string[] = [];
    const r = createRouter()
      .action('food:', async () => void order.push('btn'))
      .fallback(async (ctx) => void order.push(`msg:${ctx.text}`));
    const { last, ready } = setup(r, {
      fetchImpl: async (url) => {
        if (url.endsWith('/callback')) await ackGate.wait;
        return ok();
      },
    });
    await ready();
    last().serverSends(press());
    last().serverSends(message({ content: '350' }));
    await flush();
    expect(order).toEqual([]);
    ackGate.open();
    await flush();
    expect(order).toEqual(['btn', 'msg:350']);
  });

  it('ack 가 실패하면 그 버튼 핸들러는 건너뛰고 다음 입력은 처리한다', async () => {
    const order: string[] = [];
    const r = createRouter()
      .action('food:', async () => void order.push('btn'))
      .fallback(async () => void order.push('msg'));
    const { last, logger, ready } = setup(r, {
      fetchImpl: async (url) => (url.endsWith('/callback') ? { ok: false, status: 404, json: async () => ({}), text: async () => '' } : ok()),
    });
    await ready();
    last().serverSends(press());
    last().serverSends(message());
    await flush();
    expect(order).toEqual(['msg']);
    expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/인터랙션 응답 실패/));
  });

  it('앞 핸들러가 실패해도 다음 입력을 처리한다', async () => {
    const order: string[] = [];
    const r = createRouter()
      .action('food:', async () => {
        throw new Error('boom');
      })
      .fallback(async () => void order.push('msg'));
    const { last, ready } = setup(r);
    await ready();
    last().serverSends(press());
    last().serverSends(message());
    await flush();
    expect(order).toEqual(['msg']);
  });

  it('감시 시한을 넘으면 취소하지 않고 다음 입력으로 넘어간다', async () => {
    const g = gate();
    const order: string[] = [];
    const r = createRouter().fallback(async (ctx) => {
      order.push(`start:${ctx.text}`);
      if (ctx.text === 'A') await g.wait;
      order.push(`end:${ctx.text}`);
    });
    const { last, logger, ready } = setup(r, { handlerWatchdogMs: 10 });
    await ready();
    last().serverSends(message({ content: 'A' }));
    last().serverSends(message({ content: 'B' }));
    await tick(30);
    expect(order).toEqual(['start:A', 'start:B', 'end:B']);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/초를 넘었다 — 다음 입력으로 넘어간다/));
    g.open();
    await flush();
    expect(order).toEqual(['start:A', 'start:B', 'end:B', 'end:A']);
  });

  // 회귀: 009 D-2 재감사 [A2]#1 — 15분 넘게 기다린 버튼은 인터랙션 토큰이 만료돼 편집·실패 안내가 조용히 사라졌다
  it('오래 기다린 버튼은 봇 토큰으로 고치고 안내는 채널로 — 무표시 0', async () => {
    let t = 1_000_000;
    const g = gate();
    const r = createRouter()
      .fallback(async () => {
        await g.wait;
      })
      .action('food:', async (ctx) => {
        await ctx.edit('수정할 kcal 을 입력하세요');
        await ctx.notice('대기 중');
      });
    const { last, calls, ready } = setup(r, { now: () => t, staleButtonMs: 14 * 60_000 });
    await ready();
    last().serverSends(message());
    last().serverSends(press());
    await flush();
    t += 15 * 60_000;
    g.open();
    await flush();
    const after = calls().filter((c) => !c.url.endsWith('/callback'));
    expect(after.some((c) => c.url.includes('/webhooks/'))).toBe(false);
    expect(after).toEqual([
      expect.objectContaining({ url: expect.stringMatching(new RegExp(`/channels/${CHAT_CH}/messages/m7$`)), method: 'PATCH', body: expect.objectContaining({ components: [] }) }),
      expect.objectContaining({ url: expect.stringMatching(new RegExp(`/channels/${CHAT_CH}/messages$`)), method: 'POST', body: expect.objectContaining({ content: '대기 중' }) }),
    ]);
  });

  it('serializeByChannel: false 면 겹친다', async () => {
    const g = gate();
    const order: string[] = [];
    const r = createRouter().fallback(async (ctx) => {
      order.push(`start:${ctx.text}`);
      if (ctx.text === 'A') await g.wait;
    });
    const { last, ready } = setup(r, { serializeByChannel: false });
    await ready();
    last().serverSends(message({ content: 'A' }));
    last().serverSends(message({ content: 'B' }));
    await flush();
    expect(order).toEqual(['start:A', 'start:B']);
    g.open();
  });
});

describe('4014 강등 (F1)', () => {
  const fallbackLine = /\[discord-fit\] MESSAGE CONTENT 미허용\(4014\)/;

  it('4014 → fallback intents 로 새 IDENTIFY · 알림 1회 · `gateway 종료 코드` 줄 없음', async () => {
    const onFallback = vi.fn();
    const { last, sockets, logger, ready, hello } = setup(createRouter(), { fallbackIntents: 0, onIntentsFallback: onFallback });
    await ready();
    expect(last().identifies()[0]).toMatchObject({ intents: MESSAGE_INTENTS });
    last().emit('close', 4014);
    await tick();
    expect(sockets).toHaveLength(2);
    await hello();
    expect(last().identifies()[0]).toMatchObject({ intents: 0 });
    expect(onFallback).toHaveBeenCalledOnce();
    const errors = logger.error.mock.calls.flat().join('\n');
    expect(errors).toMatch(fallbackLine);
    // 계약: deploy/discord-switch.sh 는 이 문자열을 실패로 센다(L16′) — 강등은 버튼이 살아 있으므로 쓰지 않는다
    expect(errors).not.toMatch(/gateway 종료 코드/);
  });

  it('강등 뒤 새 세션(op 9 · close 4007)도 fallback intents · 낮춘 값의 4014 는 치명', async () => {
    const { last, sockets, logger, ready, hello } = setup(createRouter(), { fallbackIntents: 0, onIntentsFallback: () => {} });
    await ready();
    last().emit('close', 4014);
    await tick();
    await hello();
    last().serverSends({ op: 9, d: false });
    await tick();
    await hello();
    expect(last().identifies()[0]).toMatchObject({ intents: 0 });
    last().emit('close', 4007);
    await tick();
    await hello();
    expect(last().identifies()[0]).toMatchObject({ intents: 0 });
    const n = sockets.length;
    last().emit('close', 4014);
    await tick();
    expect(sockets).toHaveLength(n);
    expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/gateway 종료 코드 4014/));
  });

  it('알림 콜백이 실패해도 재접속은 계속된다', async () => {
    const { last, sockets, logger, ready } = setup(createRouter(), {
      fallbackIntents: 0,
      onIntentsFallback: async () => {
        throw new Error('notify down');
      },
    });
    await ready();
    last().emit('close', 4014);
    await tick();
    expect(sockets).toHaveLength(2);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/intents 강등 알림 실패/));
  });

  it('fallbackIntents 가 없으면 4014 는 지금처럼 치명', async () => {
    const { last, sockets, ready } = setup(createRouter());
    await ready();
    last().emit('close', 4014);
    await tick();
    expect(sockets).toHaveLength(1);
  });

  it.each([-1, 1.5])('fallbackIntents %s 는 만들 때 거부한다', (bad) => {
    expect(() => setup(createRouter(), { fallbackIntents: bad })).toThrow(/fallbackIntents/);
  });
});

describe('중립 컨텍스트 확장 (C)', () => {
  it('sentAt: timestamp → 메시지 ID → 받은 시각', () => {
    expect(messageSentAt({ timestamp: '2026-10-28T05:00:00.000Z' }, 1)).toBe(Date.parse('2026-10-28T05:00:00.000Z'));
    // snowflake 175928847299117063 = 2016-04-30T11:18:25.796Z (Discord 문서 예)
    expect(Math.abs(messageSentAt({ id: '175928847299117063' }, 1) - Date.parse('2016-04-30T11:18:25.796Z'))).toBeLessThan(1000);
    expect(messageSentAt({ id: 'x' }, 42)).toBe(42);
  });

  it('typing 은 채널 typing 엔드포인트 · 실패는 삼키고 경고', async () => {
    const r = createRouter().fallback(async (ctx) => {
      await ctx.typing();
    });
    const { last, calls, logger, ready } = setup(r, {
      fetchImpl: async (url) => (url.endsWith('/typing') ? { ok: false, status: 500, json: async () => ({}), text: async () => '' } : ok()),
    });
    await ready();
    last().serverSends(message());
    await flush();
    expect(calls().some((c) => c.url.endsWith(`/channels/${CHAT_CH}/typing`) && c.method === 'POST')).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/입력 중 표시 실패/));
  });

  it('보낸 메시지 delete · 이미 없으면(404) 조용히 끝난다', async () => {
    let deleted = 0;
    const r = createRouter().fallback(async (ctx) => {
      const ack = await ctx.reply('분석 중…');
      await ack.delete();
      await ack.delete();
    });
    const { last, calls, ready } = setup(r, {
      fetchImpl: async (url, init) => {
        if (init.method === 'DELETE') return { ok: deleted++ === 0, status: deleted === 1 ? 204 : 404, json: async () => ({}), text: async () => '' };
        return ok({ id: 'ack1' });
      },
    });
    await ready();
    last().serverSends(message());
    await flush();
    expect(calls().filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual([
      expect.stringMatching(new RegExp(`/channels/${CHAT_CH}/messages/ack1$`)),
      expect.stringMatching(new RegExp(`/channels/${CHAT_CH}/messages/ack1$`)),
    ]);
  });
});
