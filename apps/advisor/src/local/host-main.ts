// `local` 호스트 진입점 — 별 번들 `dist/local-host.cjs` (#872 · 015 V-4a).
// 사용: node local-host.cjs --reader <id> --dir <읽을 위치>
// 위치는 통합 층 코드가 mcp-config args 로 정한다(015 §3-1 원칙 1 · V-4b) — 호스트는 env 를 읽지 않는다.
// 봇 번들과 나눈 이유: 쓰기 0 시험 ② 가 이 번들의 출력 전체(의존 포함)를 검사한다(015 §13 #3).
import { HOST_USAGE, parseHostArgs, runHost } from "./host";
import { READERS } from "./readers";

if (require.main === module) {
  const a = parseHostArgs(process.argv.slice(2));
  if (!a) {
    process.stderr.write(`${HOST_USAGE}\n`);
    process.exitCode = 2;
  } else {
    try {
      runHost(READERS, a.reader, a.dir, {
        input: process.stdin,
        write: (l) => process.stdout.write(`${l}\n`),
        err: (l) => process.stderr.write(`${l}\n`),
        onEnd: () => process.stdout.write("", () => process.exit(0)), // H-R4 · 쓰는 중인 응답을 비운 뒤(#872 9-1 I4)
      });
    } catch {
      process.stderr.write("[local-host] 리더 없음\n");
      process.exitCode = 2;
    }
  }
}
