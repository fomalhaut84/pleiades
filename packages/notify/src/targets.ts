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

// 소비자 임시 클론의 `prepare`(tsc) 에는 `@types/node` 가 없다 — git 의존성은 루트 devDependencies 만 설치한다(measured-facts M1).
// 전역 `process` 를 쓰면 TS2580 으로 `npm install` 이 통째로 깨진다(1a-1 E6 실측 · #47). 여기서 필요한 최소 형태만 모듈 스코프에
// 선언한다 — 모듈 로컬 선언이라 `@types/node` 가 있는 환경에서도 충돌하지 않는다. 회귀: build-config.test.ts M3.
declare const process: { env: Record<string, string | undefined> };

export function csvEnv(name: string, opts: CsvEnvOptions = {}): () => string[] {
  return () => {
    const tokens = (process.env[name] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // numericOnly: fin 은 Number 로 변환한 값을 chat id 로 쓴다 — 탈락 규칙과 함께 정규화(`1e3` → `1000` · `007` → `7`)도 보존한다
    // (사전 리뷰 M-5). 반환은 여전히 string[].
    return opts.numericOnly
      ? tokens.filter((t) => !Number.isNaN(Number(t))).map((t) => String(Number(t)))
      : tokens;
  };
}
