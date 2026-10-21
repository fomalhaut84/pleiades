import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  // 회귀: 1a-1 (#47) E6 — 소비자 임시 클론에는 @types/node 가 없다(루트 devDep 만 설치 · measured-facts M1).
  // src 가 전역 process 등 @types/node 에 기대면 prepare 가 TS2580 으로 깨져 소비자 npm install 이 통째로 실패한다.
  // 빈 typeRoots 로 컴파일해 그 환경을 재현한다 (tsc 는 루트 devDep — 임시 클론과 같은 조건).
  it('M3: @types 없이(빈 typeRoots) src 가 컴파일된다 — 소비자 prepare 재현', () => {
    const emptyTypeRoots = mkdtempSync(join(tmpdir(), 'notify-typeroots-'));
    const tsc = require.resolve('typescript/lib/tsc.js');
    expect(() =>
      execFileSync(process.execPath, [tsc, '-p', join(__dirname, '..'), '--noEmit', '--typeRoots', emptyTypeRoots], {
        stdio: 'pipe',
      }),
    ).not.toThrow();
  }, 20_000);
});
