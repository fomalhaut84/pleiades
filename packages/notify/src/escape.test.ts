import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escape';

// 정본: fin telegram.ts:17-22 = fit telegram.ts:18-23 (동일 구현 · 003 §5-1 "발췌" · §7-2)

describe('escapeHtml', () => {
  it('& < > 세 문자만 이스케이프한다', () => {
    expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });
  it('& 를 먼저 처리해 이중 이스케이프가 없다', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
  it('따옴표는 건드리지 않는다 (텔레그램 HTML 부분집합)', () => {
    expect(escapeHtml(`"q" 'a'`)).toBe(`"q" 'a'`);
  });
});
