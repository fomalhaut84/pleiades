import { describe, expect, it } from 'vitest';
import { TELEGRAM_MAX_LENGTH, splitMessage } from './split';

// 정본: myFinance src/bot/utils/formatter.ts:50-78 (003 §3-1 "길이 초과 처리 — myFinance 분할")

describe('splitMessage', () => {
  it('한도 이하면 그대로 1청크', () => {
    expect(splitMessage('abc', 10)).toEqual(['abc']);
    expect(splitMessage('', 10)).toEqual(['']);
  });
  it('기본 한도는 4096', () => {
    expect(TELEGRAM_MAX_LENGTH).toBe(4096);
    expect(splitMessage('x'.repeat(4096))).toEqual(['x'.repeat(4096)]);
    expect(splitMessage('x'.repeat(4097))).toHaveLength(2);
  });
  it('줄 경계에서 나눈다 — 줄 사이 개행 1자를 예산에 포함', () => {
    // "aaa\nbbb\nccc" 한도 7: "aaa\nbbb"(7) 가 딱 맞고 ccc 는 다음 청크
    expect(splitMessage('aaa\nbbb\nccc', 7)).toEqual(['aaa\nbbb', 'ccc']);
    // 한도 6 이면 "aaa\nbbb" 는 7 이라 못 넣는다
    expect(splitMessage('aaa\nbbb\nccc', 6)).toEqual(['aaa', 'bbb', 'ccc']);
  });
  it('한도보다 긴 한 줄은 하드 슬라이스하고, 앞서 쌓인 청크를 먼저 밀어낸다', () => {
    expect(splitMessage('ab\n' + 'x'.repeat(10) + '\ncd', 4)).toEqual(['ab', 'xxxx', 'xxxx', 'xx', 'cd']);
  });
  it('빈 줄은 개행만 소비하며 살아남는다', () => {
    expect(splitMessage('a\n\nb', 3)).toEqual(['a\n', 'b']);
  });
  it('Infinity 한도는 항상 1청크 (어댑터 소유 모드)', () => {
    const long = 'x\n'.repeat(5000);
    expect(splitMessage(long, Number.POSITIVE_INFINITY)).toEqual([long]);
  });
  it('청크 합집합이 원문의 줄을 하나도 잃지 않는다 (절단이 아니라 분할 — Q10-L)', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `line ${i} ${'·'.repeat(i % 40)}`);
    const text = lines.join('\n');
    const chunks = splitMessage(text, 200);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
    expect(chunks.join('\n').split('\n')).toEqual(lines);
  });
});
