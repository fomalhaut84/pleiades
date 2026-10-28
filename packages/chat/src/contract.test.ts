import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pkg = join(__dirname, '..');
const tsc = require.resolve('typescript/lib/tsc.js');

describe('@pleiades/chat — 공개 계약 (009 0-6 · C-2)', () => {
  it('빌드된 선언(.d.ts)에 특정 메신저 어휘가 없다', () => {
    const out = mkdtempSync(join(tmpdir(), 'chat-dts-'));
    execFileSync(process.execPath, [tsc, '-p', pkg, '--outDir', out, '--emitDeclarationOnly'], { stdio: 'pipe' });
    const files = readdirSync(out).filter((f) => f.endsWith('.d.ts'));
    expect(files).toContain('index.d.ts');
    const banned = /telegram|telegraf|grammy|callback_data|inline_keyboard|chat_id|parse_mode/i;
    const hits = files.flatMap((f) =>
      readFileSync(join(out, f), 'utf8')
        .split('\n')
        .filter((line) => banned.test(line))
        .map((line) => `${f}: ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  }, 30_000);
});

// notify build-config.test.ts M1~M3 와 같은 조건 — D-1 에서 루트 prepare 가 이 패키지를 빌드한다
describe('packages/chat/tsconfig.json — prepare 안전 조건', () => {
  const tsconfig = JSON.parse(readFileSync(join(pkg, 'tsconfig.json'), 'utf8')) as {
    compilerOptions: { skipLibCheck?: boolean };
    exclude: string[];
  };
  it('M1·M2: skipLibCheck · 테스트 패턴 exclude', () => {
    expect(tsconfig.compilerOptions.skipLibCheck).toBe(true);
    for (const p of ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**']) expect(tsconfig.exclude).toContain(p);
  });
  it('M3: @types 없이(빈 typeRoots) src 가 컴파일된다', () => {
    const empty = mkdtempSync(join(tmpdir(), 'chat-typeroots-'));
    expect(() => execFileSync(process.execPath, [tsc, '-p', pkg, '--noEmit', '--typeRoots', empty], { stdio: 'pipe' })).not.toThrow();
  }, 30_000);
});

describe('버전 단일 출처 (#85 와 같은 규칙)', () => {
  it('chat 의 package.json · lock 버전 = 루트 버전', () => {
    const read = (...p: string[]) => JSON.parse(readFileSync(join(pkg, ...p), 'utf8')) as { version: string; packages?: Record<string, { version?: string }> };
    const root = read('..', '..', 'package.json').version;
    expect(read('package.json').version).toBe(root);
    const lock = read('package-lock.json');
    expect(lock.version).toBe(root);
    expect(lock.packages?.['']?.version).toBe(root);
  });
});
