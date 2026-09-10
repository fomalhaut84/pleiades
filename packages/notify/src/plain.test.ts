import { describe, expect, it } from 'vitest';
import { toPlain } from './plain';

// 정본: Q10-P ① 태그-only · 코어 정규식 = fin /<[^>]+>/g (003 §3-1 2026-09-09 정정 · PR #39 Codex P2)

describe('toPlain', () => {
  it('태그만 벗긴다', () => {
    expect(toPlain('<b>bold</b> and <i>it</i>')).toBe('bold and it');
    expect(toPlain('<a href="https://x">link</a>')).toBe('link');
  });
  it('엔티티는 디코드하지 않는다 (라이브 두 구현과 동일)', () => {
    expect(toPlain('a &amp; b &lt;c&gt;')).toBe('a &amp; b &lt;c&gt;');
  });
  it('리터럴 <> 는 남긴다 — fin 수량자 + (fit 의 * 는 <> 를 지운다)', () => {
    expect(toPlain('x <> y')).toBe('x <> y');
  });
  it('여러 줄·중첩 태그', () => {
    expect(toPlain('<pre><code>a\nb</code></pre>')).toBe('a\nb');
  });
});
