import { describe, expect, it } from 'vitest';
import { TELEGRAM_MAX_LENGTH, splitMessage } from './split';

// 정본: myFinance src/bot/utils/formatter.ts:50-78 (003 §3-1 "길이 초과 처리 — myFinance 분할")

// 청크가 반쪽 서로게이트로 끝나거나 시작하는가 (String.prototype.isWellFormed 는 ES2024 lib — 타입 target ES2017 이라 직접 검사)
const hasLoneSurrogateEdge = (s: string): boolean => {
  const first = s.charCodeAt(0);
  const last = s.charCodeAt(s.length - 1);
  return (first >= 0xdc00 && first <= 0xdfff) || (last >= 0xd800 && last <= 0xdbff);
};

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
  // 회귀: #47 사전 리뷰 M-2 — 0·음수는 for 루프가 무한 증식, NaN 은 비교가 전부 false
  it.each([0, -1, Number.NaN, 0.5])('maxLength %s 는 RangeError', (bad) => {
    expect(() => splitMessage('x', bad)).toThrow(RangeError);
  });
  it('한도를 넘는 본문이 전부 빈 줄이면 [] 를 돌려준다 (fin 정본의 성질 — deliver 가 실패로 올린다 · M-1)', () => {
    expect(splitMessage('\n'.repeat(10), 4)).toEqual([]);
  });
  // 회귀: PR #49 Codex P2 — 하드 슬라이스 경계가 서로게이트 쌍 사이에 떨어지면 반쪽이 각 청크에서 무효 문자가 된다
  it('하드 슬라이스가 UTF-16 서로게이트 쌍(이모지)을 가르지 않는다', () => {
    const chunks = splitMessage('a'.repeat(4095) + '😀Z', 4096);
    expect(chunks).toEqual(['a'.repeat(4095), '😀Z']);
    for (const c of chunks) expect(hasLoneSurrogateEdge(c)).toBe(false);
    // 경계가 쌍 사이가 아니면 정확히 maxLength 에서 끊는다
    expect(splitMessage('a'.repeat(4094) + '😀Z', 4096)).toEqual(['a'.repeat(4094) + '😀', 'Z']);
    // 연속 이모지 — 어느 청크도 반쪽으로 끝나거나 시작하지 않는다
    for (const c of splitMessage('😀'.repeat(50), 7)) expect(hasLoneSurrogateEdge(c)).toBe(false);
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
