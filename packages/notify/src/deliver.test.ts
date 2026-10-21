import { describe, expect, it, vi } from 'vitest';
import { deliverOne, type DeliveryPolicy } from './deliver';
import { html, type Content, type Transport } from './types';

// 정본: fit send.ts:39-75 (attempt-- 예산 보존 · 네트워크만 백오프) + fin telegram.ts:61-73 (청크 단위 재시도·폴백)

type Call = { target: string; content: Content };

function fakeTransport(
  script: Array<'ok' | Error>,
  maxLength = 4096, // 유한 = 코어 소유 모드. Infinity 는 마지막 describe 에서만 명시한다
): { transport: Transport; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const transport: Transport = {
    channel: 'fake',
    maxLength,
    async send(target, content) {
      calls.push({ target, content: { ...content } });
      const step = script[i++] ?? 'ok';
      if (step instanceof Error) throw step;
      return `ref-${calls.length}`;
    },
  };
  return { transport, calls };
}

function policy(over: Partial<DeliveryPolicy> = {}): DeliveryPolicy & { slept: number[] } {
  const slept: number[] = [];
  return {
    retryDelaysMs: [10, 20, 30],
    sleep: async (ms) => {
      slept.push(ms);
    },
    logger: { warn: vi.fn(), error: vi.fn() },
    label: 'test',
    ...over,
    slept,
  };
}

const net = (code = 'ECONNRESET') => Object.assign(new Error(`net ${code}`), { code });
const parse = () => new Error("Bad Request: can't parse entities: unsupported start tag");

describe('deliverOne — 단일 청크', () => {
  it('첫 시도 성공이면 send 1회 · ref 반환', async () => {
    const { transport, calls } = fakeTransport(['ok']);
    const ref = await deliverOne(transport, 't1', html('<b>hi</b>'), policy());
    expect(ref).toBe('ref-1');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ target: 't1', content: { text: '<b>hi</b>', format: 'html' } });
  });

  it('네트워크 오류는 [2000,8000,30000] 백오프로 총 4회 시도 후 마지막 오류를 던진다', async () => {
    const errs = [net('ETIMEDOUT'), net('ECONNRESET'), net('ENETUNREACH'), net('EAI_AGAIN')];
    const { transport, calls } = fakeTransport(errs);
    const p = policy({ retryDelaysMs: [2000, 8000, 30000] });
    await expect(deliverOne(transport, 't', html('x'), p)).rejects.toBe(errs[3]);
    expect(calls).toHaveLength(4);
    expect(p.slept).toEqual([2000, 8000, 30000]);
    expect(p.logger.warn).toHaveBeenCalledTimes(3);
    expect(String((p.logger.warn as ReturnType<typeof vi.fn>).mock.calls[0][0])).toMatch(
      /^\[test\] 전송 재시도 1\/4 \(t, 2000ms 후\): Error: net ETIMEDOUT$/,
    );
  });

  it('네트워크 오류 뒤 성공하면 ref 를 돌려준다', async () => {
    const { transport, calls } = fakeTransport([net(), 'ok']);
    const p = policy();
    await expect(deliverOne(transport, 't', html('x'), p)).resolves.toBe('ref-2');
    expect(calls).toHaveLength(2);
    expect(p.slept).toEqual([10]);
  });

  it('네트워크 오류가 아니면 즉시 던진다 (재시도 0)', async () => {
    const boom = new Error('Forbidden: bot was blocked by the user');
    const { transport, calls } = fakeTransport([boom]);
    const p = policy();
    await expect(deliverOne(transport, 't', html('x'), p)).rejects.toBe(boom);
    expect(calls).toHaveLength(1);
    expect(p.slept).toEqual([]);
  });

  it('HTML 파싱 실패 → 같은 청크를 plain 으로 즉시 재전송 (백오프 없음 · 예산 보존)', async () => {
    const { transport, calls } = fakeTransport([parse(), 'ok']);
    const p = policy();
    await expect(deliverOne(transport, 't', html('<b>a</b> &amp; <x>'), p)).resolves.toBe('ref-2');
    expect(calls.map((c) => c.content)).toEqual([
      { text: '<b>a</b> &amp; <x>', format: 'html' },
      { text: 'a &amp; ', format: 'plain' },
    ]);
    expect(p.slept).toEqual([]);
  });

  it('plain 전환 후에도 네트워크 재시도 예산은 그대로 4회다 (fit attempt-- · fin 의 새 예산 4회가 아니다)', async () => {
    const errs = [parse(), net(), net(), net(), net()];
    const { transport, calls } = fakeTransport(errs);
    const p = policy();
    await expect(deliverOne(transport, 't', html('<b>x</b>'), p)).rejects.toBe(errs[4]);
    // html 1 + plain 4 = 5 호출 (파싱 실패는 시도 횟수를 소비하지 않는다)
    expect(calls).toHaveLength(5);
    expect(calls.slice(1).every((c) => c.content.format === 'plain')).toBe(true);
    expect(p.slept).toEqual([10, 20, 30]);
  });

  it('plain 으로도 파싱 실패가 나면 폴백을 다시 하지 않고 그 오류를 던진다', async () => {
    const e2 = parse();
    const { transport, calls } = fakeTransport([parse(), e2]);
    await expect(deliverOne(transport, 't', html('<b>x</b>'), policy())).rejects.toBe(e2);
    expect(calls).toHaveLength(2);
  });

  it('비-파싱 400 은 폴백하지 않는다 (fin isParseError 의 400 전체 규칙을 승계하지 않음 — 관측 변경 후보)', async () => {
    const tooLong = Object.assign(new Error('Bad Request: message is too long'), { error_code: 400 });
    const { transport, calls } = fakeTransport([tooLong]);
    await expect(deliverOne(transport, 't', html('<b>x</b>'), policy())).rejects.toBe(tooLong);
    expect(calls).toHaveLength(1);
  });

  it('components 는 폴백 시에도 유지된다', async () => {
    const kb = { inline_keyboard: [[{ text: 'ok', callback_data: 'x' }]] };
    const { transport, calls } = fakeTransport([parse(), 'ok']);
    await deliverOne(transport, 't', html('<b>x</b>', kb), policy());
    expect(calls[1].content).toEqual({ text: 'x', format: 'plain', components: kb });
  });

  it('plain 본문은 그대로 보낸다 (format plain 입력)', async () => {
    const { transport, calls } = fakeTransport(['ok']);
    await deliverOne(transport, 't', { text: '<not html>', format: 'plain' }, policy());
    expect(calls[0].content).toEqual({ text: '<not html>', format: 'plain' });
  });
});

describe('deliverOne — 분할 (maxLength 유한 · 코어 소유)', () => {
  it('maxLength 로 분할해 청크를 순서대로 보내고 마지막 청크의 ref 를 돌려준다', async () => {
    const { transport, calls } = fakeTransport([], 5);
    const ref = await deliverOne(transport, 't', html('aaa\nbbb\nccc'), policy());
    expect(calls.map((c) => c.content.text)).toEqual(['aaa', 'bbb', 'ccc']);
    expect(ref).toBe('ref-3');
  });

  it('components 는 마지막 청크에만 붙는다', async () => {
    const kb = { inline_keyboard: [] };
    const { transport, calls } = fakeTransport([], 5);
    await deliverOne(transport, 't', html('aaa\nbbb', kb), policy());
    expect(calls[0].content.components).toBeUndefined();
    expect(calls[1].content.components).toBe(kb);
  });

  it('청크 2 의 네트워크 오류는 청크 2 만 재시도한다 — 청크 1 중복 없음 (S-3)', async () => {
    const { transport, calls } = fakeTransport(['ok', net(), 'ok'], 5);
    const p = policy();
    await expect(deliverOne(transport, 't', html('aaa\nbbb'), p)).resolves.toBe('ref-3');
    expect(calls.map((c) => c.content.text)).toEqual(['aaa', 'bbb', 'bbb']);
    expect(p.slept).toEqual([10]);
  });

  it('청크 2 의 파싱 실패는 청크 2 만 plain 으로 간다 (fin 청크 단위 폴백)', async () => {
    const { transport, calls } = fakeTransport(['ok', parse(), 'ok'], 10);
    await deliverOne(transport, 't', html('<b>aaa</b>\n<i>bbb</i>'), policy());
    expect(calls.map((c) => [c.content.text, c.content.format])).toEqual([
      ['<b>aaa</b>', 'html'],
      ['<i>bbb</i>', 'html'],
      ['bbb', 'plain'],
    ]);
  });

  it('청크 2 가 최종 실패하면 그 오류를 던진다 (청크 1 은 이미 나갔다 — 부분 성공은 호출부가 결과로 알 수 없다)', async () => {
    const boom = new Error('Forbidden');
    const { transport, calls } = fakeTransport(['ok', boom], 5);
    await expect(deliverOne(transport, 't', html('aaa\nbbb'), policy())).rejects.toBe(boom);
    expect(calls).toHaveLength(2);
  });
});

describe('deliverOne — 회귀 (#47 사전 리뷰)', () => {
  it('M-1: 분할 결과가 비면(본문이 빈 줄뿐) 전송 0회를 성공으로 보고하지 않고 throw', async () => {
    const { transport, calls } = fakeTransport([], 4);
    await expect(deliverOne(transport, 't', html('\n'.repeat(10)), policy())).rejects.toThrow(/분할 결과가 비었다/);
    expect(calls).toHaveLength(0);
  });
  it('info: maxLength NaN 은 어댑터 소유 모드로 빠지지 않고 RangeError', async () => {
    const { transport, calls } = fakeTransport([], Number.NaN);
    await expect(deliverOne(transport, 't', html('x'), policy())).rejects.toThrow(RangeError);
    expect(calls).toHaveLength(0);
  });
  it('retryDelaysMs 가 비면 총 1회 시도 — 첫 네트워크 오류를 그대로 던진다', async () => {
    const e = net();
    const { transport, calls } = fakeTransport([e]);
    const p = policy({ retryDelaysMs: [] });
    await expect(deliverOne(transport, 't', html('x'), p)).rejects.toBe(e);
    expect(calls).toHaveLength(1);
    expect(p.slept).toEqual([]);
  });
});

describe('deliverOne — maxLength Infinity (어댑터 소유)', () => {
  it('분할·재시도·폴백 없이 send 를 정확히 1회 호출한다', async () => {
    const e = net();
    const { transport, calls } = fakeTransport([e], Number.POSITIVE_INFINITY);
    const p = policy();
    await expect(deliverOne(transport, 't', html('x'.repeat(10000)), p)).rejects.toBe(e);
    expect(calls).toHaveLength(1);
    expect(p.slept).toEqual([]);
  });
  it('파싱 실패도 어댑터 몫 — 코어는 폴백하지 않는다', async () => {
    const e = parse();
    const { transport, calls } = fakeTransport([e], Number.POSITIVE_INFINITY);
    await expect(deliverOne(transport, 't', html('<b>x</b>'), policy())).rejects.toBe(e);
    expect(calls).toHaveLength(1);
  });
});
