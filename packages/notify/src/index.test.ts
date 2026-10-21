import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNotifier, createTelegramTransport, Route } from './index';

// 스모크: 패키지가 "존재"하는 것이 아니라 공개 표면이 건너오는지 (1a-0 초안 1-7)
describe('@pleiades/notify smoke', () => {
  it('공개 팩토리와 Route 가 export 된다', () => {
    expect(typeof createNotifier).toBe('function');
    expect(typeof createTelegramTransport).toBe('function');
    expect(Object.keys(Route).length).toBeGreaterThan(0);
  });
});

// 회귀: #85 (#48 I1) — 버전은 package.json 이 정본이고 소비자는 루트(위임점)를 설치한다.
// 루트와 패키지 · 두 lockfile 이 어긋나면 태그와 설치된 버전 표기가 갈라진다.
// src 에 VERSION 상수를 두지 않는다 — package.json 을 읽으려면 @types/node 가 필요한데
// 소비자 임시 클론에는 없다(build-config.test.ts M3).
describe('버전 단일 출처', () => {
  type Manifest = { version: string; packages?: Record<string, { version?: string }> };
  const read = (...segments: string[]): Manifest =>
    JSON.parse(readFileSync(join(__dirname, '..', ...segments), 'utf8')) as Manifest;

  it('루트 · packages/notify 의 package.json 과 lockfile 버전이 같다', () => {
    const notify = read('package.json').version;
    expect(read('..', '..', 'package.json').version).toBe(notify);
    // lockfile 은 최상위와 packages[""] 두 곳에 버전을 둔다 (#85 사전 리뷰 info)
    for (const lock of [read('package-lock.json'), read('..', '..', 'package-lock.json')]) {
      expect(lock.version).toBe(notify);
      expect(lock.packages?.['']?.version).toBe(notify);
    }
  });
});
