import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAliveMarker, fileAliveMarker, type AliveState } from './alive-marker';
import { createChat } from './chat';
import type { WebSocketLike } from './gateway';
import type { ChatFetch, ChatResponse } from './rest';
import { createRouter } from './router';

const TOKEN = ['MTIz' + '0'.repeat(20), 'Gabc' + 'DE', 'x'.repeat(30)].join('.');

class FakeSocket implements WebSocketLike {
  private handlers: Record<string, Array<(...a: unknown[]) => void>> = {};
  on(event: string, fn: (...a: unknown[]) => void): void {
    (this.handlers[event] ??= []).push(fn);
  }
  send(): void {}
  close(): void {}
  terminate(): void {}
  serverSends(p: { op: number; d?: unknown; s?: number; t?: string }): void {
    for (const fn of this.handlers.message ?? []) fn(Buffer.from(JSON.stringify(p)));
  }
}

const ok = (): ChatResponse => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('createAliveMarker — 쓰기 간격 (#589)', () => {
  it('READY·RESUMED 는 곧바로 · ACK 는 간격 안이면 건너뛴다', () => {
    let t = 1_000_000;
    const writes: string[] = [];
    const m = createAliveMarker({ write: (x) => writes.push(x), minIntervalMs: 60_000, now: () => t });
    m.mark('ready');
    t += 41_000;
    m.mark('ack'); // 41초 — 건너뜀
    t += 20_000;
    m.mark('ack'); // 61초 — 씀
    t += 1_000;
    m.mark('resumed'); // 간격 무관
    expect(writes.map((w) => JSON.parse(w).state)).toEqual(['ready', 'ack', 'resumed']);
    expect(JSON.parse(writes[0])).toEqual({ at: new Date(1_000_000).toISOString(), state: 'ready' });
  });
  it('첫 ACK 는 쓴다 · 실패한 쓰기는 간격을 잡지 않아 다음 ACK 에 다시 쓴다', () => {
    let fail = true;
    const writes: string[] = [];
    const m = createAliveMarker({
      write: (x) => {
        if (fail) throw new Error('EACCES');
        writes.push(x);
      },
      now: () => 5,
    });
    expect(() => m.mark('ack')).toThrow();
    fail = false;
    m.mark('ack');
    expect(writes).toHaveLength(1);
  });
});

describe('fileAliveMarker — 실제 파일', () => {
  it('없는 디렉터리를 만들고 600 으로 쓴다 · 내용은 시각과 상태뿐 · 임시 파일이 남지 않는다', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'chat-alive-')), 'logs');
    const file = join(dir, 'alive-fit.json');
    fileAliveMarker(file, { now: () => 0 }).mark('ready');
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8'))).sort()).toEqual(['at', 'state']);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir)).toEqual(['alive-fit.json']);
  });
  it('rename 이 실패하면 던지고 임시 파일을 남기지 않는다', () => {
    // 회귀: #589 9-1 info 2 — ACK 마다 다시 쓰므로 실패가 이어지면 .tmp 가 쌓였다
    const dir = mkdtempSync(join(tmpdir(), 'chat-alive-'));
    const file = join(dir, 'alive-fin.json');
    mkdirSync(join(file, 'x'), { recursive: true }); // 대상이 비지 않은 디렉터리 — rename 실패
    expect(() => fileAliveMarker(file).mark('ready')).toThrow();
    expect(readdirSync(dir)).toEqual(['alive-fin.json']);
  });
});

describe('createChat aliveMarker — gateway 신호 (#589)', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
  afterEach(() => vi.restoreAllMocks());

  const setup = (mark: (s: AliveState) => void) => {
    const sockets: FakeSocket[] = [];
    const logger = { warn: vi.fn(), error: vi.fn() };
    const chat = createChat({
      token: () => TOKEN,
      router: createRouter(),
      allowedUserIds: () => [],
      allowedChannelIds: () => [],
      label: 'discord-fit',
      logger,
      fetch: vi.fn<ChatFetch>(async () => ok()),
      createSocket: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
      identifyGuard: 'none',
      aliveMarker: { mark },
    });
    return { chat, logger, last: () => sockets[sockets.length - 1] };
  };

  it('READY · ACK · RESUMED 에 표지를 남긴다 · 다른 dispatch 에는 남기지 않는다', async () => {
    const states: AliveState[] = [];
    const { chat, last } = setup((s) => states.push(s));
    chat.start();
    last().serverSends({ op: 10, d: { heartbeat_interval: 41250 } });
    await flush();
    last().serverSends({ op: 0, t: 'READY', s: 1, d: { session_id: 's1' } });
    last().serverSends({ op: 11 });
    last().serverSends({ op: 0, t: 'GUILD_CREATE', s: 2, d: {} });
    last().serverSends({ op: 0, t: 'RESUMED', s: 3 });
    chat.stop();
    expect(states).toEqual(['ready', 'ack', 'resumed']);
  });

  it('표지가 던져도 연결은 그대로 · 경고는 한 번만 · 원문 토큰을 남기지 않는다', async () => {
    const { chat, logger, last } = setup(() => {
      throw new Error(`EACCES ${TOKEN}`);
    });
    chat.start();
    last().serverSends({ op: 10, d: { heartbeat_interval: 41250 } });
    await flush();
    last().serverSends({ op: 0, t: 'READY', s: 1, d: { session_id: 's1' } });
    last().serverSends({ op: 11 });
    last().serverSends({ op: 11 });
    chat.stop();
    const aliveWarns = logger.warn.mock.calls.map(([m]) => String(m)).filter((m) => m.includes('생존 표지'));
    expect(aliveWarns).toHaveLength(1);
    expect(aliveWarns[0]).not.toContain(TOKEN);
    expect(logger.warn.mock.calls.some(([m]) => String(m).includes('gateway 준비 완료'))).toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
