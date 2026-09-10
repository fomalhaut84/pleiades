/**
 * 수신자 해석기 — 쉼표 구분 env 를 호출 시점마다 읽는다 (원본 둘 다 호출마다 env 를 읽는다).
 *
 * 기본은 fit 규칙(`send.ts:24-29` · 문자열 유지). `numericOnly` 는 fin 규칙(`scheduler.ts:22-27` 등 5지점 ·
 * `.map(Number).filter(!isNaN)`)을 보존한다 — 비숫자 토큰의 탈락 여부가 `total`(= DB `AlertHistory.recipientCount` 3곳 ·
 * API `totalChats` 1곳)의 값을 바꾸므로(003 발견 19) fin 호출부는 `numericOnly: true` 로 옮긴다.
 * 반환은 항상 `string[]` — `target: string` 고정 (003 발견 10).
 */
export interface CsvEnvOptions {
  numericOnly?: boolean;
}

export function csvEnv(name: string, opts: CsvEnvOptions = {}): () => string[] {
  return () => {
    const tokens = (process.env[name] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return opts.numericOnly ? tokens.filter((t) => !Number.isNaN(Number(t))) : tokens;
  };
}
