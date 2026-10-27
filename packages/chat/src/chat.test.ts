import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChat } from './chat';
import { MESSAGE_INTENTS, type WebSocketLike } from './gateway';
import { createIdentifyGuard, type GuardStore } from './identify-guard';
import type { ChatFetch, ChatResponse } from './rest';
import { createRouter, type Router } from './router';

const TOKEN = ['MTIz' + '0'.repeat(20), 'Gabc' + 'DE', 'x'.repeat(30)].join('.');
const USER = '111111111111111111';
const CH = '222222222222222222';

class FakeSocket implements WebSocketLike {
  readonly sent: Array<{ op: number; d?: Record<string, unknown> }> = [];
  closedWith: number | undefined;
  private handlers: Record<string, Array<(...a: unknown[]) => void>> = {};
  constructor(readonly url: string) {}
  on(event: string, fn: (...a: unknown[]) => void): void {
    (this.handlers[event] ??= []).push(fn);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as { op: number; d?: Record<string, unknown> });
  }
  close(code?: number): void {
    this.closedWith = code;
  }
  terminate(): void {}
  emit(event: string, ...args: unknown[]): void {
    for (const fn of this.handlers[event] ?? []) fn(...args);
  }
  serverSends(p: { op: number; d?: unknown; s?: number; t?: string }): void {
    this.emit('message', Buffer.from(JSON.stringify(p)));
  }
}

const ok = (body: unknown = { id: 'm1' }): ChatResponse => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function setup(router: Router, extra: { store?: GuardStore; limit?: number; onBlocked?: () => void; remaining?: number } = {}) {
  const sockets: FakeSocket[] = [];
  const fetch = vi.fn<ChatFetch>(async (url) =>
    url.endsWith('/gateway/bot')
      ? ok({ session_start_limit: { total: 1000, remaining: extra.remaining ?? 999, reset_after: 1000 } })
      : ok(),
  );
  const logger = { warn: vi.fn(), error: vi.fn() };
  const chat = createChat({
    token: () => TOKEN,
    router,
    allowedUserIds: () => [USER],
    allowedChannelIds: () => [CH],
    label: 'discord-fit',
    logger,
    fetch,
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    reconnectDelaysMs: [10],
    retryDelaysMs: [],
    sleep: async () => {},
    identifyGuard:
      extra.store === undefined
        ? 'none'
        : createIdentifyGuard({ store: extra.store, limit: extra.limit, onBlocked: extra.onBlocked ?? (() => {}) }),
  });
  const last = () => sockets[sockets.length - 1];
  const rest = () =>
    fetch.mock.calls
      .filter(([u]) => !u.endsWith('/gateway/bot'))
      .map(([url, init]) => ({ url, method: init.method, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined }));
  const ready = async (): Promise<void> => {
    chat.start();
    last().serverSends({ op: 10, d: { heartbeat_interval: 41250 } });
    await flush();
    last().serverSends({ op: 0, t: 'READY', s: 1, d: { session_id: 's1', resume_gateway_url: 'wss://resume.example' } });
  };
  return { chat, sockets, last, fetch, logger, rest, ready };
}

const message = (over: Record<string, unknown> = {}) => ({
  op: 0,
  t: 'MESSAGE_CREATE',
  s: 2,
  d: { id: 'msg1', channel_id: CH, content: '체중 72', type: 0, author: { id: USER }, attachments: [], ...over },
});

describe('createChat — 연결 (0-1 · 0-4)', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
  afterEach(() => vi.restoreAllMocks());

  it('IDENTIFY 에 메시지 intents 를 싣는다 · 준비 로그 문자열 계약', async () => {
    const { last, logger, ready } = setup(createRouter());
    await ready();
    const identify = last().sent.find((p) => p.op === 2);
    expect(identify?.d).toMatchObject({ token: TOKEN, intents: MESSAGE_INTENTS });
    expect(MESSAGE_INTENTS).toBe(512 | 32768);
    // 계약: deploy/discord-switch.sh judge_gateway 가 이 줄을 찾는다(L16′) — 바꾸면 운영 승계 판정이 깨진다
    expect(logger.warn).toHaveBeenCalledWith('[discord-fit] gateway 준비 완료');
  });

  it('4014(intent 미허용)는 다시 접속하지 않고 포털 안내를 남긴다', async () => {
    const { last, sockets, logger, ready } = setup(createRouter());
    await ready();
    last().emit('close', 4014);
    expect(sockets).toHaveLength(1);
    expect(logger.error.mock.calls[0][0]).toMatch(/4014.*MESSAGE CONTENT INTENT/);
  });
});

describe('createChat — 메시지 (C-6 · 0-2)', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
  afterEach(() => vi.restoreAllMocks());

  it('허용 사용자·채널의 메시지 → 라우터 → 같은 채널로 답장', async () => {
    const r = createRouter().hears(/체중\s*(\d+)/, async (ctx, m) => void (await ctx.reply(`기록 ${m[1]}kg`)));
    const { last, rest, ready } = setup(r);
    await ready();
    last().serverSends(message());
    await flush();
    expect(rest()).toEqual([expect.objectContaining({ url: expect.stringContaining(`/channels/${CH}/messages`), method: 'POST', body: expect.objectContaining({ content: '기록 72kg' }) })]);
  });

  it('봇·웹훅·시스템 메시지 · 다른 채널은 무시(답하지 않는다)', async () => {
    const h = vi.fn(async () => {});
    const { last, rest, logger, ready } = setup(createRouter().fallback(h));
    await ready();
    last().serverSends(message({ author: { id: USER, bot: true } }));
    last().serverSends(message({ webhook_id: 'w1' }));
    last().serverSends(message({ type: 7 }));
    last().serverSends(message({ channel_id: '999999999999999999' }));
    await flush();
    expect(h).not.toHaveBeenCalled();
    expect(rest()).toEqual([]);
    expect(logger.warn.mock.calls.flat().join('\n')).not.toMatch(/허용되지 않은 사용자/);
  });

  it('허용 채널의 낯선 사용자는 기록만 하고 답하지 않는다(R8)', async () => {
    const h = vi.fn(async () => {});
    const { last, rest, logger, ready } = setup(createRouter().fallback(h));
    await ready();
    last().serverSends(message({ author: { id: '333333333333333333' } }));
    await flush();
    expect(h).not.toHaveBeenCalled();
    expect(rest()).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/허용되지 않은 사용자의 메시지 무시/));
  });

  it('첨부가 컨텍스트에 실린다(내려받기는 핸들러가 부를 때만)', async () => {
    const seen: string[] = [];
    const r = createRouter().attachment(async (ctx) => void seen.push(...ctx.attachments.map((a) => `${a.name}:${a.size}`)));
    const { last, fetch, ready } = setup(r);
    await ready();
    last().serverSends(message({ content: '', attachments: [{ id: 'a', filename: 'p.jpg', size: 7, content_type: 'image/jpeg', url: 'https://cdn.discordapp.com/x' }] }));
    await flush();
    expect(seen).toEqual(['p.jpg:7']);
    expect(fetch.mock.calls.some(([u]) => u.includes('cdn.discordapp.com'))).toBe(false);
  });

  it('핸들러가 던지면 원문 없이 일반 안내', async () => {
    const r = createRouter().fallback(async () => {
      throw new Error(`secret ${TOKEN}`);
    });
    const { last, rest, logger, ready } = setup(r);
    await ready();
    last().serverSends(message());
    await flush();
    expect(rest()[0].body.content).toMatch(/처리 중 오류/);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(TOKEN);
  });
});

describe('createChat — 버튼 (0-2 · 0-3)', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
  afterEach(() => vi.restoreAllMocks());

  const press = (over: Record<string, unknown> = {}) => ({
    op: 0,
    t: 'INTERACTION_CREATE',
    s: 3,
    d: { id: 'i1', token: 'itok', application_id: 'app1', type: 3, channel_id: CH, data: { custom_id: 'adj:yes', component_type: 2 }, member: { user: { id: USER } }, message: { id: 'm7' }, ...over },
  });

  it('허용이면 지연 응답(type 6) 뒤 핸들러 · edit 는 버튼을 지운다', async () => {
    const r = createRouter().action('adj:', async (ctx) => ctx.edit({ text: '<b>적용됨</b>', format: 'html' }));
    const { last, rest, ready } = setup(r);
    await ready();
    last().serverSends(press());
    await flush();
    const c = rest();
    expect(c[0]).toMatchObject({ url: expect.stringMatching(/\/interactions\/i1\/itok\/callback$/), body: { type: 6 } });
    expect(c[1]).toMatchObject({ url: expect.stringMatching(/\/webhooks\/app1\/itok\/messages\/@original$/), method: 'PATCH', body: { content: '**적용됨**', components: [] } });
  });

  it('setButtons 로 버튼 교체 · notice 는 누른 사람에게만', async () => {
    const r = createRouter().action('adj:', async (ctx) => {
      await ctx.setButtons([[{ label: '되돌리기', action: 'adj:undo' }]]);
      await ctx.notice('바꿨습니다');
    });
    const { last, rest, ready } = setup(r);
    await ready();
    last().serverSends(press());
    await flush();
    const c = rest();
    expect(c[1].body.components[0].components[0]).toMatchObject({ custom_id: 'adj:undo' });
    expect(c[2]).toMatchObject({ method: 'POST', body: { content: '바꿨습니다', flags: 64 } });
  });

  it('허용 밖(사용자 또는 채널)은 핸들러 없이 본인에게만 거부', async () => {
    const h = vi.fn(async () => {});
    const { last, rest, ready } = setup(createRouter().action('', h));
    await ready();
    last().serverSends(press({ member: { user: { id: '333333333333333333' } } }));
    last().serverSends(press({ channel_id: '999999999999999999' }));
    await flush();
    expect(h).not.toHaveBeenCalled();
    expect(rest().map((x) => x.body)).toEqual([
      { type: 4, data: { content: '이 버튼을 누를 권한이 없습니다.', flags: 64 } },
      { type: 4, data: { content: '이 버튼을 누를 권한이 없습니다.', flags: 64 } },
    ]);
  });

  it('선택 메뉴(component_type 3)는 무시', async () => {
    const { last, rest, ready } = setup(createRouter());
    await ready();
    last().serverSends(press({ data: { custom_id: 'x', component_type: 3 } }));
    await flush();
    expect(rest()).toEqual([]);
  });
});

describe('createChat — IDENTIFY 보호가 gateway 에 연결돼 있다 (0-5)', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
  afterEach(() => vi.restoreAllMocks());

  it('재시작 루프: 프로세스 N 개가 같은 기록을 쓰면 임계 뒤 IDENTIFY 0 · 알림 1회', async () => {
    const store: GuardStore & { text?: string } = { read: () => store.text, write: (t) => void (store.text = t) };
    const onBlocked = vi.fn();
    let identifies = 0;
    for (let restart = 0; restart < 12; restart++) {
      const { chat, last } = setup(createRouter(), { store, limit: 5, onBlocked });
      chat.start();
      last().serverSends({ op: 10, d: { heartbeat_interval: 41250 } });
      await flush();
      identifies += last().sent.filter((p) => p.op === 2).length;
      chat.stop(); // 프로세스 종료
    }
    expect(identifies).toBe(5);
    expect(onBlocked).toHaveBeenCalledOnce();
  });

  it('거부되면 소켓을 닫고 허용 시각에 다시 시도한다', async () => {
    vi.useFakeTimers();
    try {
      const store: GuardStore & { text?: string } = { read: () => store.text, write: (t) => void (store.text = t) };
      const { chat, sockets, last, logger } = setup(createRouter(), { store, remaining: 10 });
      chat.start();
      last().serverSends({ op: 10, d: { heartbeat_interval: 41250 } });
      await vi.advanceTimersByTimeAsync(0);
      expect(last().sent.some((p) => p.op === 2)).toBe(false);
      expect(last().closedWith).toBe(1000);
      expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/\[discord-fit\] gateway IDENTIFY 보류/));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(sockets).toHaveLength(2);
      chat.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('RESUME 은 횟수를 쓰지 않는다', async () => {
    const store: GuardStore & { text?: string } = { read: () => store.text, write: (t) => void (store.text = t) };
    const { last, ready } = setup(createRouter(), { store, limit: 1 });
    await ready();
    last().serverSends({ op: 7 }); // RECONNECT
    await new Promise((r) => setTimeout(r, 20));
    last().serverSends({ op: 10, d: { heartbeat_interval: 41250 } });
    await flush();
    expect(last().sent.map((p) => p.op)).toContain(6);
    expect(JSON.parse(store.text as string).attempts).toHaveLength(1);
  });

  // 회귀: #332 사전 리뷰 info 8 — beforeIdentify 를 기다리는 사이의 경쟁
  it('검사를 기다리는 중 stop() 이면 IDENTIFY 를 보내지 않는다', async () => {
    let release: (r: ChatResponse) => void = () => {};
    const sockets: FakeSocket[] = [];
    const chat = createChat({
      token: () => TOKEN,
      router: createRouter(),
      allowedUserIds: () => [USER],
      allowedChannelIds: () => [CH],
      label: 'discord-fit',
      logger: { warn: vi.fn(), error: vi.fn() },
      // gateway/bot 응답을 붙잡아 검사를 대기 상태로 둔다
      fetch: () => new Promise<ChatResponse>((r) => (release = r)),
      createSocket: (url) => {
        const s = new FakeSocket(url);
        sockets.push(s);
        return s;
      },
      identifyGuard: createIdentifyGuard({ store: { read: () => undefined, write: () => {} }, onBlocked: () => {} }),
    });
    chat.start();
    sockets[0].serverSends({ op: 10, d: { heartbeat_interval: 41250 } });
    await flush();
    chat.stop();
    release(ok({ session_start_limit: { total: 1000, remaining: 999, reset_after: 1 } }));
    await flush();
    expect(sockets[0].sent.some((p) => p.op === 2)).toBe(false);
    expect(sockets).toHaveLength(1);
  });

  it('검사를 기다리는 중 소켓이 바뀌면 옛 판정이 새 소켓에 IDENTIFY 를 보내지 않는다', async () => {
    const { chat, sockets, last } = setup(createRouter(), { store: { read: () => undefined, write: () => {} } });
    chat.start();
    const first = last();
    first.serverSends({ op: 10, d: { heartbeat_interval: 41250 } }); // 검사 시작(비동기)
    first.emit('close', 1006); // 검사 끝나기 전에 끊김 → 재접속 예약
    await flush();
    expect(first.sent.some((p) => p.op === 2)).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(sockets).toHaveLength(2);
    expect(sockets[1].sent.some((p) => p.op === 2)).toBe(false); // HELLO 전이라 아무것도 보내지 않았다
    chat.stop();
  });
});

