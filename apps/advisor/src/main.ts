// apps/advisor — 통합 어드바이저 진입점 (012 §8 · 4b).
// 4b-1a(#679): 골격만 — 코어(4b-1b · #680)와 Discord 조립(4b-2)이 이 자리에 붙는다. 지금은 아무것도 띄우지 않고 끝난다.
// 로컬 실행은 tools/local/run.sh adv -- node dist/advisor.cjs 만(I-4′·I-5′·I-8 가드 · pm2 리허설 없음 · 012 §4-3).

export const NOT_READY = "advisor: 코어가 아직 없다 (012 4b-1b · #680) — 아무것도 띄우지 않는다";

/** 종료 코드를 돌려준다 — 코어가 붙기 전에는 늘 1(띄울 것이 없다). */
export function main(write: (line: string) => void = (l) => process.stderr.write(`${l}\n`)): number {
  write(NOT_READY);
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}
