import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// 회귀: 이슈 #31 (1a-0) 사전 리뷰 M1·M2 — prepare(tsc) 가 소비자 임시 클론에서 깨지는 두 조건.
// M1: skipLibCheck 없이는 1a-1 의 grammy peerDep .d.ts 가 target ES2017 에서 TS2583 으로 실패한다.
// M2: exclude 가 *.test.ts 만 막으면 *.spec.ts / __tests__ 가 vitest 없는 임시 클론에서 TS2307 으로 샌다.
const tsconfig = JSON.parse(readFileSync(join(__dirname, '..', 'tsconfig.json'), 'utf8')) as {
  compilerOptions: { skipLibCheck?: boolean };
  exclude: string[];
};

describe('packages/notify/tsconfig.json — prepare 안전 조건', () => {
  it('M1: skipLibCheck 가 켜져 있다', () => {
    expect(tsconfig.compilerOptions.skipLibCheck).toBe(true);
  });
  it('M2: vitest 가 집어가는 테스트 패턴이 전부 exclude 된다', () => {
    for (const pattern of ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**']) {
      expect(tsconfig.exclude).toContain(pattern);
    }
  });
});
