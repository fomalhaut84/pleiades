import { describe, expect, it } from 'vitest';
import { VERSION } from './index';

// 스모크: 패키지가 "존재"하는 것이 아니라 값이 건너오는지 (초안 1-7)
describe('@pleiades/notify smoke', () => {
  it('VERSION is a string', () => {
    expect(typeof VERSION).toBe('string');
  });
});
