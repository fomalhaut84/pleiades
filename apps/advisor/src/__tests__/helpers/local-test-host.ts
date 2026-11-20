// 시험 호스트 진입점 (#872) — 운영 host-main 과 같은 인자 · 같은 루프에 시험 레지스트리를 싣는다. 시험이 esbuild 로 번들해 띄운다.
import { parseHostArgs, runHost } from "../../local/host";
import { TEST_REGISTRY } from "./local-readers";

const a = parseHostArgs(process.argv.slice(2, 6));
if (!a) process.exit(2);
const delay = Number(process.argv[6] ?? 0); // 시험: 기동 지연 양성 대조
setTimeout(() => runHost(TEST_REGISTRY, a.reader, a.dir, {
  input: process.stdin,
  write: (l) => process.stdout.write(`${l}\n`),
  err: (l) => process.stderr.write(`${l}\n`),
  onEnd: () => process.exit(0),
}), delay);
