import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createIdentifyGuard, fileGuardStore, type GuardStore } from './identify-guard';

const HOUR = 60 * 60 * 1000;
const memStore = (): GuardStore & { text?: string } => {
  const s: GuardStore & { text?: string } = {
    read: () => s.text,
    write: (t) => {
      s.text = t;
    },
  };
  return s;
};

describe('createIdentifyGuard — 재시작을 넘어 센다 (0-5 · R5)', () => {
  it('재시작 루프: 프로세스마다 새 guard 여도 임계 뒤 거부 · 알림은 1회', async () => {
    // 회귀 기준: 009 §6 D-0 수용 기준 — "프로세스를 N 회 재시작시키는 루프에서 임계 뒤 IDENTIFY 0 · 알림 1회"
    const store = memStore();
    const onBlocked = vi.fn();
    let t = 1_000_000;
    const results: boolean[] = [];
    for (let restart = 0; restart < 25; restart++) {
      const guard = createIdentifyGuard({ store, limit: 10, onBlocked, now: () => t }); // 재시작 = 메모리 상태 0
      results.push((await guard.check()).ok);
      t += 1000;
    }
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(results.slice(10).every((ok) => !ok)).toBe(true);
    expect(onBlocked).toHaveBeenCalledOnce();
    expect(onBlocked.mock.calls[0][0]).toMatchObject({ reason: 'local-limit', count: 10, limit: 10 });
  });

  it('창(24 h)이 지나면 다시 허용 · retryAt 은 가장 오래된 기록 + 창', async () => {
    const store = memStore();
    let t = 0;
    const guard = () => createIdentifyGuard({ store, limit: 2, onBlocked: () => {}, now: () => t });
    expect((await guard().check()).ok).toBe(true); // t=0
    t = HOUR;
    expect((await guard().check()).ok).toBe(true);
    t = 2 * HOUR;
    const blocked = await guard().check();
    expect(blocked).toEqual({ ok: false, info: expect.objectContaining({ retryAt: 24 * HOUR }) });
    t = 24 * HOUR + 1;
    expect((await guard().check()).ok).toBe(true);
  });

  it('알림 기록도 남는다 — 창 안 재차단은 다시 알리지 않고, 창이 지난 뒤 새 차단은 다시 알린다', async () => {
    const store = memStore();
    const onBlocked = vi.fn();
    let t = 0;
    const check = () => createIdentifyGuard({ store, limit: 1, onBlocked, now: () => t }).check();
    await check(); // 허용
    t = 1;
    await check(); // 차단 · 알림
    t = 2;
    await check(); // 차단 · 알림 없음
    expect(onBlocked).toHaveBeenCalledTimes(1);
    t = 25 * HOUR;
    await check(); // 허용(창 지남)
    t = 25 * HOUR + 1;
    await check(); // 새 차단 · 알림
    expect(onBlocked).toHaveBeenCalledTimes(2);
  });

  it('플랫폼이 알려 준 남은 횟수가 임계 이하면 로컬 기록과 무관하게 거부', async () => {
    const onBlocked = vi.fn();
    const guard = createIdentifyGuard({ store: memStore(), limit: 100, onBlocked, now: () => 0 });
    expect((await guard.check({ remaining: 101, resetAfterMs: 1 })).ok).toBe(true);
    const d = await guard.check({ remaining: 100, resetAfterMs: 2 * HOUR });
    expect(d).toEqual({ ok: false, info: expect.objectContaining({ reason: 'remote-remaining', retryAt: 2 * HOUR }) });
    expect(onBlocked).toHaveBeenCalledOnce();
  });

  it('기록을 읽거나 쓸 수 없으면 거부(fail-closed) · 알림은 프로세스당 1회', async () => {
    const onBlocked = vi.fn();
    const broken: GuardStore = {
      read: () => undefined,
      write: () => {
        throw new Error('EROFS');
      },
    };
    const guard = createIdentifyGuard({ store: broken, onBlocked, now: () => 0 });
    expect((await guard.check()).ok).toBe(false);
    expect((await guard.check()).ok).toBe(false);
    expect(onBlocked).toHaveBeenCalledOnce();
    expect(onBlocked.mock.calls[0][0].reason).toBe('state-unavailable');
    const unreadable = createIdentifyGuard({
      store: { read: () => { throw new Error('EACCES'); }, write: () => {} },
      onBlocked,
      now: () => 0,
    });
    expect((await unreadable.check()).ok).toBe(false);
  });

  it('알림이 던져도 차단은 그대로', async () => {
    const store = memStore();
    const guard = createIdentifyGuard({ store, limit: 1, onBlocked: () => { throw new Error('webhook down'); }, now: () => 0 });
    await guard.check();
    expect((await guard.check()).ok).toBe(false);
  });

  it('시계가 뒤로 가도 기록을 잃지 않는다(#332 사전 리뷰 info 2)', async () => {
    const store = memStore();
    let t = 10 * HOUR;
    const check = () => createIdentifyGuard({ store, limit: 2, onBlocked: () => {}, now: () => t }).check();
    await check();
    await check();
    t = 9 * HOUR; // NTP 보정으로 1시간 역행
    expect((await check()).ok).toBe(false);
    expect(JSON.parse(store.text as string).attempts).toHaveLength(2);
  });

  it('남은 횟수 기본 임계는 limit 과 무관하다 — limit 을 키워도 영구 차단이 아니다(#332 사전 리뷰 info 7)', async () => {
    const guard = createIdentifyGuard({ store: memStore(), limit: 2000, onBlocked: () => {}, now: () => 0 });
    expect((await guard.check({ remaining: 900, resetAfterMs: 1 })).ok).toBe(true);
  });

  it('깨진 기록은 비어 있다고 본다(다음 쓰기로 덮는다)', async () => {
    const store = memStore();
    store.text = '{not json';
    expect((await createIdentifyGuard({ store, onBlocked: () => {}, now: () => 5 }).check()).ok).toBe(true);
    expect(JSON.parse(store.text as string)).toEqual({ attempts: [5] });
  });
});

describe('fileGuardStore — 실제 파일 (재시작 = 새 store 인스턴스)', () => {
  it('없는 디렉터리를 만들고 600 으로 쓴다 · 다시 열어도 같은 기록', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'chat-guard-')), 'nested');
    const file = join(dir, 'identify-fit.json');
    const onBlocked = vi.fn();
    for (let i = 0; i < 4; i++) {
      await createIdentifyGuard({ store: fileGuardStore(file), limit: 3, onBlocked, now: () => i }).check();
    }
    expect(onBlocked).toHaveBeenCalledOnce();
    expect(JSON.parse(readFileSync(file, 'utf8')).attempts).toEqual([0, 1, 2]);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
  it('없는 파일은 undefined · 읽기 권한 오류는 던진다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'chat-guard-'));
    expect(fileGuardStore(join(dir, 'none.json')).read()).toBeUndefined();
    const f = join(dir, 'x.json');
    writeFileSync(f, '{}', { mode: 0o000 });
    if (process.getuid?.() !== 0) expect(() => fileGuardStore(f).read()).toThrow();
  });
});
