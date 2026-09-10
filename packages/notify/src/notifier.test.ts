import { describe, expect, it, vi } from 'vitest';
import { createNotifier } from './notifier';
import { html, Route, type Content, type Transport } from './types';

// 정본: fit send.ts:77-91 sendToAll (집계 · per-target catch · 실패 로그) + 003 §4-2 확정 (targets · targetCount · label · raw error)

function fake(script: Record<string, Array<'ok' | Error>> = {}, maxLength = 4096 /* 유한 = 코어 소유 모드 */) {
  const calls: Array<{ target: string; content: Content }> = [];
  const idx: Record<string, number> = {};
  const transport: Transport = {
    channel: 'fake',
    maxLength,
    async send(target, content) {
      calls.push({ target, content });
      const i = (idx[target] = (idx[target] ?? 0) + 1);
      const step = script[target]?.[i - 1] ?? 'ok';
      if (step instanceof Error) throw step;
      return `${target}#${i}`;
    },
  };
  return { transport, calls };
}

const logger = () => ({ warn: vi.fn(), error: vi.fn() }); // Logger 에 구조적으로 대입된다
const noSleep = async () => {};
const TOKEN = 'bot999:AAAsecret';

describe('createNotifier — targets / targetCount', () => {
  it('Route 별 해석기를 호출 시점마다 실행한다', () => {
    let ids = ['1'];
    const n = createNotifier({ transport: fake().transport, targets: { ALLOWED: () => ids } });
    expect(n.targets(Route.ALLOWED)).toEqual(['1']);
    expect(n.targetCount(Route.ALLOWED)).toBe(1);
    ids = ['1', '2'];
    expect(n.targets(Route.ALLOWED)).toEqual(['1', '2']);
    expect(n.targetCount(Route.ALLOWED)).toBe(2);
  });
  it('미매핑 Route 는 빈 목록 · 0 (fit ADMIN — 003 §4-2 확정 4)', () => {
    const n = createNotifier({ transport: fake().transport, targets: { ALLOWED: () => ['1'] } });
    expect(n.targets(Route.ADMIN)).toEqual([]);
    expect(n.targetCount(Route.ADMIN)).toBe(0);
  });
  it('targets() 는 매번 새 배열이다 (호출부가 변형해도 무해)', () => {
    const base = ['1'];
    const n = createNotifier({ transport: fake().transport, targets: { ALLOWED: () => base } });
    n.targets(Route.ALLOWED).push('x');
    expect(base).toEqual(['1']);
  });
});

describe('createNotifier — notify 집계', () => {
  it('전원 성공: sent/total · first · deliveries', async () => {
    const { transport, calls } = fake();
    const n = createNotifier({ transport, targets: { ALLOWED: () => ['a', 'b'] }, sleep: noSleep, logger: logger() });
    const r = await n.notify(Route.ALLOWED, html('<b>x</b>'), { label: 'briefing' });
    expect(r).toEqual({
      sent: 2,
      failed: 0,
      total: 2,
      first: { target: 'a', ref: 'a#1' },
      deliveries: [
        { target: 'a', ok: true, ref: 'a#1' },
        { target: 'b', ok: true, ref: 'b#1' },
      ],
    });
    expect(calls.map((c) => c.target)).toEqual(['a', 'b']); // 순차 · 순서 보존
  });

  it('일부 실패: 실패는 catch 되어 다음 대상으로 계속 · error 는 raw message · 로그는 sanitize', async () => {
    const boom = new Error(`Forbidden ${TOKEN}`);
    const { transport } = fake({ a: [boom] });
    const log = logger();
    const n = createNotifier({ transport, targets: { ALLOWED: () => ['a', 'b'] }, sleep: noSleep, logger: log });
    const r = await n.notify(Route.ALLOWED, html('x'), { label: 'alert' });
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.total).toBe(2);
    expect(r.first).toEqual({ target: 'b', ref: 'b#1' });
    expect(r.deliveries[0]).toEqual({ target: 'a', ok: false, error: `Forbidden ${TOKEN}` }); // Q19 C — raw
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(String(log.error.mock.calls[0][0])).toBe('[alert] 메시지 전송 실패 (a): Error: Forbidden bot<REDACTED>');
  });

  it('전원 실패: first 는 undefined', async () => {
    const { transport } = fake({ a: [new Error('x')], b: [new Error('y')] });
    const n = createNotifier({ transport, targets: { ALLOWED: () => ['a', 'b'] }, sleep: noSleep, logger: logger() });
    const r = await n.notify(Route.ALLOWED, html('x'));
    expect(r).toMatchObject({ sent: 0, failed: 2, total: 2 });
    expect(r.first).toBeUndefined();
    expect(r.deliveries.map((d) => d.error)).toEqual(['x', 'y']);
  });

  it('비-Error throw 는 String() 으로 담는다', async () => {
    const { transport } = fake({ a: ['ok'] });
    transport.send = async () => {
      throw 'raw string';
    };
    const n = createNotifier({ transport, targets: { ALLOWED: () => ['a'] }, sleep: noSleep, logger: logger() });
    const r = await n.notify(Route.ALLOWED, html('x'));
    expect(r.deliveries[0].error).toBe('raw string');
  });

  it('대상 0 이면 전송 없이 빈 결과 (fail-safe 는 호출부 몫 · 003 §4-2 확정 4)', async () => {
    const factory = vi.fn(() => fake().transport);
    const n = createNotifier({ transport: factory, targets: { ALLOWED: () => [] } });
    const r = await n.notify(Route.ALLOWED, html('x'));
    expect(r).toEqual({ sent: 0, failed: 0, total: 0, deliveries: [] });
    expect(r.first).toBeUndefined();
    expect(factory).not.toHaveBeenCalled(); // transport 해석 전에 반환
  });

  it('label 미지정 시 prefix 는 [notify]', async () => {
    const { transport } = fake({ a: [new Error('e')] });
    const log = logger();
    const n = createNotifier({ transport, targets: { ALLOWED: () => ['a'] }, sleep: noSleep, logger: log });
    await n.notify(Route.ALLOWED, html('x'));
    expect(String(log.error.mock.calls[0][0])).toMatch(/^\[notify\] /);
  });

  it('재시도 정책이 코어를 통해 전달된다 (retryDelaysMs · sleep · 재시도 로그 label)', async () => {
    const net = Object.assign(new Error('net'), { code: 'ECONNRESET' });
    const { transport } = fake({ a: [net, 'ok'] });
    const slept: number[] = [];
    const log = logger();
    const n = createNotifier({
      transport,
      targets: { ALLOWED: () => ['a'] },
      retryDelaysMs: [5],
      sleep: async (ms) => {
        slept.push(ms);
      },
      logger: log,
    });
    const r = await n.notify(Route.ALLOWED, html('x'), { label: 'cron' });
    expect(r.sent).toBe(1);
    expect(slept).toEqual([5]);
    expect(String(log.warn.mock.calls[0][0])).toMatch(/^\[cron\] 전송 재시도 1\/2 \(a, 5ms 후\)/);
  });

  it('분할은 transport.maxLength 를 따른다 · ref 는 마지막 청크', async () => {
    const { transport, calls } = fake({}, 5);
    const n = createNotifier({ transport, targets: { ALLOWED: () => ['a'] }, sleep: noSleep, logger: logger() });
    const r = await n.notify(Route.ALLOWED, html('aaa\nbbb'));
    expect(calls.map((c) => c.content.text)).toEqual(['aaa', 'bbb']);
    expect(r.first).toEqual({ target: 'a', ref: 'a#2' });
  });
});

describe('createNotifier — transport 해석 (지연 생성 · Route 매핑)', () => {
  it('팩토리는 생성 시점에 호출되지 않고 첫 notify 에서 1회만 호출된다 (제약 1)', async () => {
    const { transport } = fake();
    const factory = vi.fn(() => transport);
    const n = createNotifier({ transport: factory, targets: { ALLOWED: () => ['a'] }, sleep: noSleep, logger: logger() });
    expect(factory).not.toHaveBeenCalled();
    await n.notify(Route.ALLOWED, html('x'));
    await n.notify(Route.ALLOWED, html('y'));
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('Route 별 transport 맵 (003 §1-4 요구사항 1)', async () => {
    const tg = fake();
    const dc = fake();
    const n = createNotifier({
      transport: { ALLOWED: () => dc.transport, ADMIN: tg.transport },
      targets: { ALLOWED: () => ['u'], ADMIN: () => ['ops'] },
      sleep: noSleep,
      logger: logger(),
    });
    await n.notify(Route.ALLOWED, html('x'));
    await n.notify(Route.ADMIN, html('y'));
    expect(dc.calls.map((c) => c.target)).toEqual(['u']);
    expect(tg.calls.map((c) => c.target)).toEqual(['ops']);
  });

  it('대상은 있는데 그 Route 의 transport 가 없으면 설정 오류로 throw', async () => {
    const n = createNotifier({
      transport: { ALLOWED: fake().transport },
      targets: { ALLOWED: () => ['u'], ADMIN: () => ['ops'] },
    });
    await expect(n.notify(Route.ADMIN, html('y'))).rejects.toThrow(/transport.*ADMIN/);
  });

  it('팩토리가 throw 하면 캐시되지 않고 다음 notify 에서 다시 시도한다', async () => {
    const { transport } = fake();
    let fail = true;
    const factory = vi.fn(() => {
      if (fail) throw new Error('bot not ready');
      return transport;
    });
    const n = createNotifier({ transport: factory, targets: { ALLOWED: () => ['a'] }, sleep: noSleep, logger: logger() });
    await expect(n.notify(Route.ALLOWED, html('x'))).rejects.toThrow('bot not ready');
    fail = false;
    await expect(n.notify(Route.ALLOWED, html('x'))).resolves.toMatchObject({ sent: 1 });
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('M-1: 빈 분할은 실패로 집계된다 — first 없음 · error 에 사유', async () => {
    const { transport, calls } = fake({}, 4);
    const n = createNotifier({ transport, targets: { ALLOWED: () => ['a'] }, sleep: noSleep, logger: logger() });
    const r = await n.notify(Route.ALLOWED, html('\n'.repeat(10)));
    expect(calls).toHaveLength(0);
    expect(r).toMatchObject({ sent: 0, failed: 1, total: 1 });
    expect(r.first).toBeUndefined();
    expect(r.deliveries[0].error).toMatch(/분할 결과가 비었다/);
  });

  it('domain 은 자리만 — 결과·로그에 나타나지 않는다', async () => {
    const { transport } = fake({ a: [new Error('e')] });
    const log = logger();
    const n = createNotifier({ transport, domain: 'finance', targets: { ALLOWED: () => ['a'] }, sleep: noSleep, logger: log });
    const r = await n.notify(Route.ALLOWED, html('x'));
    expect(JSON.stringify(r)).not.toContain('finance');
    expect(String(log.error.mock.calls[0][0])).not.toContain('finance');
  });
});
