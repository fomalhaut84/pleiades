import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDiscordGateway, type DiscordButtonContext, type WebSocketLike } from './discord-gateway';
import type { FetchLike, FetchResponseLike } from './discord';

// 가짜 토큰 — 실제 형식(<id>.<ts>.<hmac>)을 흉내 내되 소스에 그 모양의 리터럴을 두지 않는다(push protection 오탐 · #149)
const TOKEN = ['MTIz' + '0'.repeat(20), 'Gabc' + 'DE', 'x'.repeat(30)].join('.');

class FakeSocket implements WebSocketLike {
  readonly sent: Array<{ op: number; d?: unknown }> = [];
  closedWith: number | undefined;
  terminated = false;
  private handlers: Record<string, Array<(...a: unknown[]) => void>> = {};
  constructor(readonly url: string) {}
  on(event: string, fn: (...a: unknown[]) => void): void {
    (this.handlers[event] ??= []).push(fn);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as { op: number; d?: unknown });
  }
  close(code?: number): void {
    this.closedWith = code;
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(event: string, ...args: unknown[]): void {
    for (const fn of this.handlers[event] ?? []) fn(...args);
  }
  serverSends(p: { op: number; d?: unknown; s?: number; t?: string }): void {
    this.emit('message', Buffer.from(JSON.stringify(p)));
  }
}

const okRes: FetchResponseLike = { ok: true, status: 204, json: async () => ({}), text: async () => '' };

function setup(onButton: (ctx: DiscordButtonContext) => Promise<void> = async () => {}) {
  const sockets: FakeSocket[] = [];
  const fetch = vi.fn<FetchLike>(async () => okRes);
  const logger = { warn: vi.fn(), error: vi.fn() };
  const gw = createDiscordGateway({
    token: TOKEN,
    onButton,
    allowedUserIds: () => ['111'],
    allowedChannelIds: () => ['222'],
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    fetch,
    logger,
    reconnectDelaysMs: [10, 20],
  });
  const last = () => sockets[sockets.length - 1];
  const bodies = () => fetch.mock.calls.map((c) => ({ url: c[0], method: c[1].method, body: JSON.parse(c[1].body as string) }));
  return { gw, sockets, last, fetch, logger, bodies };
}

const interaction = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  token: 'itok',
  application_id: 'app1',
  type: 3,
  channel_id: '222',
  data: { custom_id: 'vest:confirm:r1', component_type: 2 },
  member: { user: { id: '111' } },
  message: { id: 'm1' },
  ...over,
});

describe('createDiscordGateway — 연결 수명주기', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('HELLO → IDENTIFY(intents 0) · heartbeat 주기 · ACK', () => {
    const { gw, last } = setup();
    gw.start();
    expect(last().url).toBe('wss://gateway.discord.gg/?v=10&encoding=json');
    last().serverSends({ op: 10, d: { heartbeat_interval: 1000 } });
    expect(last().sent[0]).toEqual({
      op: 2,
      d: { token: TOKEN, intents: 0, properties: { os: 'linux', browser: 'pleiades', device: 'pleiades' } },
    });
    vi.advanceTimersByTime(1000);
    expect(last().sent.filter((p) => p.op === 1)).toHaveLength(1);
    last().serverSends({ op: 11 });
    vi.advanceTimersByTime(1000);
    expect(last().sent.filter((p) => p.op === 1)).toHaveLength(2);
    gw.stop();
  });

  it('ACK 가 없으면 좀비로 보고 끊은 뒤 resume URL 로 RESUME', () => {
    const { gw, sockets, last } = setup();
    gw.start();
    last().serverSends({ op: 10, d: { heartbeat_interval: 1000 } });
    last().serverSends({ op: 0, t: 'READY', s: 1, d: { session_id: 'sess', resume_gateway_url: 'wss://resume.example' } });
    vi.advanceTimersByTime(1000); // 첫 beat (ACK 없음)
    vi.advanceTimersByTime(1000); // 다음 tick — 좀비
    expect(sockets[0].terminated).toBe(true); // 좀비는 close 핸드셰이크를 기다리지 않는다
    vi.advanceTimersByTime(10);
    expect(sockets).toHaveLength(2);
    expect(last().url).toBe('wss://resume.example/?v=10&encoding=json');
    last().serverSends({ op: 10, d: { heartbeat_interval: 1000 } });
    expect(last().sent[0]).toEqual({ op: 6, d: { token: TOKEN, session_id: 'sess', seq: 1 } });
    gw.stop();
  });

  it('INVALID_SESSION(false) 면 새 세션으로 IDENTIFY', () => {
    const { gw, last } = setup();
    gw.start();
    last().serverSends({ op: 10, d: { heartbeat_interval: 1000 } });
    last().serverSends({ op: 0, t: 'READY', s: 1, d: { session_id: 'sess', resume_gateway_url: 'wss://r' } });
    last().serverSends({ op: 9, d: false });
    vi.advanceTimersByTime(10);
    expect(last().url).toBe('wss://gateway.discord.gg/?v=10&encoding=json');
    last().serverSends({ op: 10, d: { heartbeat_interval: 1000 } });
    expect(last().sent[0].op).toBe(2);
    gw.stop();
  });

  // 회귀: #149 사전 리뷰 info — 4007·4009 는 새 세션으로
  it('close 4009 는 다시 접속하되 RESUME 이 아니라 IDENTIFY', () => {
    const { gw, last } = setup();
    gw.start();
    last().serverSends({ op: 10, d: { heartbeat_interval: 1000 } });
    last().serverSends({ op: 0, t: 'READY', s: 3, d: { session_id: 'sess', resume_gateway_url: 'wss://r' } });
    last().emit('close', 4009, '');
    vi.advanceTimersByTime(10);
    expect(last().url).toBe('wss://gateway.discord.gg/?v=10&encoding=json');
    last().serverSends({ op: 10, d: { heartbeat_interval: 1000 } });
    expect(last().sent[0].op).toBe(2);
    gw.stop();
  });

  it('메시지 처리 중 예외는 리스너 밖으로 던지지 않는다 (READY d=null)', () => {
    const { gw, last, logger } = setup();
    gw.start();
    expect(() => last().serverSends({ op: 0, t: 'READY', s: 1, d: null as unknown as undefined })).not.toThrow();
    expect(logger.error).not.toHaveBeenCalled();
    gw.stop();
  });

  it('인증 실패(4004)는 다시 접속하지 않는다 · 토큰을 로그에 남기지 않는다', () => {
    const { gw, sockets, last, logger } = setup();
    gw.start();
    last().emit('close', 4004, Buffer.from('Authentication failed.'));
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(1);
    expect(String(logger.error.mock.calls[0][0])).toContain('4004');
    for (const c of [...logger.warn.mock.calls, ...logger.error.mock.calls]) expect(String(c[0])).not.toContain(TOKEN);
  });

  it('일반 close 는 백오프로 다시 접속 · stop 이면 멈춘다', () => {
    const { gw, sockets, last } = setup();
    gw.start();
    last().emit('close', 1006, '');
    vi.advanceTimersByTime(10);
    expect(sockets).toHaveLength(2);
    gw.stop();
    expect(sockets[1].closedWith).toBe(1000);
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
  });

  it('빈 토큰이면 시작하지 않는다', () => {
    expect(() =>
      createDiscordGateway({
        token: ' ',
        onButton: async () => {},
        allowedUserIds: () => [],
        allowedChannelIds: () => [],
        createSocket: () => new FakeSocket('x'),
      }).start(),
    ).toThrow('토큰이 없다');
  });
});

describe('createDiscordGateway — 버튼 처리', () => {
  async function click(over: Record<string, unknown>, onButton?: (ctx: DiscordButtonContext) => Promise<void>) {
    const env = setup(onButton);
    env.gw.start();
    env.last().serverSends({ op: 0, t: 'INTERACTION_CREATE', s: 2, d: interaction(over) });
    await vi.waitFor(() => expect(env.fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    env.gw.stop();
    return env;
  }

  it('허용 사용자·채널 → 지연 응답(type 6) 후 핸들러 · edit 는 원본 수정(버튼 제거) · reply 는 본인만', async () => {
    const seen: string[] = [];
    const { bodies } = await click({}, async (ctx) => {
      seen.push(`${ctx.customId}|${ctx.userId}|${ctx.channelId}|${ctx.messageId}`);
      await ctx.edit('<b>확정됨</b>');
      await ctx.reply('완료 *별*');
    });
    expect(seen).toEqual(['vest:confirm:r1|111|222|m1']);
    const b = bodies();
    expect(b[0]).toEqual({ url: 'https://discord.com/api/v10/interactions/i1/itok/callback', method: 'POST', body: { type: 6 } });
    expect(b[1]).toEqual({
      url: 'https://discord.com/api/v10/webhooks/app1/itok/messages/@original',
      method: 'PATCH',
      body: { content: '**확정됨**', allowed_mentions: { parse: [] }, components: [] },
    });
    expect(b[2]).toEqual({
      url: 'https://discord.com/api/v10/webhooks/app1/itok',
      method: 'POST',
      body: { content: '완료 \\*별\\*', flags: 64, allowed_mentions: { parse: [] } },
    });
  });

  it('removeButtons 는 본문 없이 components 만 비운다', async () => {
    const { bodies } = await click({}, async (ctx) => {
      await ctx.removeButtons();
    });
    expect(bodies()[1]).toEqual({
      url: 'https://discord.com/api/v10/webhooks/app1/itok/messages/@original',
      method: 'PATCH',
      body: { components: [] },
    });
  });

  it('허용되지 않은 사용자 → 본인에게만 거부 안내 · 핸들러 미호출', async () => {
    const onButton = vi.fn(async () => {});
    const { bodies } = await click({ member: { user: { id: '999' } } }, onButton);
    expect(onButton).not.toHaveBeenCalled();
    expect(bodies()[0].body).toEqual({ type: 4, data: { content: '이 버튼을 누를 권한이 없습니다.', flags: 64 } });
  });

  it('허용 사용자라도 다른 채널이면 거부 (DM 의 user 필드도 같다)', async () => {
    const onButton = vi.fn(async () => {});
    const { bodies } = await click({ channel_id: '333', member: undefined, user: { id: '111' } }, onButton);
    expect(onButton).not.toHaveBeenCalled();
    expect(bodies()[0].body.type).toBe(4);
  });

  it('핸들러가 던지면 원문 없이 일반 실패 안내', async () => {
    const { bodies, logger } = await click({}, async () => {
      throw new Error(`boom ${TOKEN}`);
    });
    expect(bodies()[1].body.content).toBe('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    expect(String(logger.error.mock.calls[0][0])).not.toContain(TOKEN);
  });

  it('빈 본문으로 edit 하면 보내지 않고 일반 실패 안내', async () => {
    const { bodies } = await click({}, async (ctx) => {
      await ctx.edit('<b></b>');
    });
    expect(bodies().map((b) => b.method)).toEqual(['POST', 'POST']); // type 6 · 실패 안내(PATCH 없음)
    expect(bodies()[1].body.content).toBe('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
  });

  // 회귀: PR #150 Codex P2 — 선택 메뉴(component_type 3)는 type 3 이어도 버튼 핸들러로 가지 않는다
  it('선택 메뉴 등 버튼이 아닌 component 는 무시', async () => {
    const onButton = vi.fn(async () => {});
    const env = setup(onButton);
    env.gw.start();
    env.last().serverSends({ op: 0, t: 'INTERACTION_CREATE', s: 2, d: interaction({ data: { custom_id: 'vest:confirm:r1', component_type: 3 } }) });
    await new Promise((r) => setTimeout(r, 0));
    expect(onButton).not.toHaveBeenCalled();
    expect(env.fetch).not.toHaveBeenCalled();
    env.gw.stop();
  });

  it('버튼이 아닌 인터랙션(슬래시 명령 등)은 무시', async () => {
    const env = setup();
    env.gw.start();
    env.last().serverSends({ op: 0, t: 'INTERACTION_CREATE', s: 2, d: interaction({ type: 2 }) });
    await new Promise((r) => setTimeout(r, 0));
    expect(env.fetch).not.toHaveBeenCalled();
    env.gw.stop();
  });
});
