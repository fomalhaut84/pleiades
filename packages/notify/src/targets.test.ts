import { afterEach, describe, expect, it } from 'vitest';
import { csvEnv } from './targets';

// fit send.ts:24-29 (문자열 유지) · fin scheduler.ts:22-27 (map(Number).filter(!isNaN) — numericOnly)
const NAME = 'PLEIADES_TEST_CHAT_IDS';

afterEach(() => {
  delete process.env[NAME];
});

describe('csvEnv', () => {
  it('미설정이면 빈 배열', () => {
    expect(csvEnv(NAME)()).toEqual([]);
  });
  it('쉼표 분리 · trim · 빈 토큰 제거', () => {
    process.env[NAME] = ' 111 , 222,,  ,333 ';
    expect(csvEnv(NAME)()).toEqual(['111', '222', '333']);
  });
  it('호출 시점마다 env 를 다시 읽는다', () => {
    const read = csvEnv(NAME);
    process.env[NAME] = '1';
    expect(read()).toEqual(['1']);
    process.env[NAME] = '1,2';
    expect(read()).toEqual(['1', '2']);
  });
  it('기본은 문자열 유지 — 비숫자 토큰도 대상에 포함된다 (fit 규칙)', () => {
    process.env[NAME] = '111,abc,-5';
    expect(csvEnv(NAME)()).toEqual(['111', 'abc', '-5']);
  });
  it('numericOnly 면 Number 변환 실패 토큰을 조용히 탈락시키고 값을 Number 로 정규화한다 (fin 규칙 · total 의미 보존 · M-5)', () => {
    process.env[NAME] = '111,abc,-5, 7 ,1e3,007,0x10,-1001234567890';
    expect(csvEnv(NAME, { numericOnly: true })()).toEqual(['111', '-5', '7', '1000', '7', '16', '-1001234567890']);
  });
});
