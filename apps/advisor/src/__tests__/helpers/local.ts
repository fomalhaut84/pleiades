// `local` 호스트 시험 도우미 (#872 · 015 V-4a) — 시험 리더 · 번들 만들기 · 쓰기 API 검사 · 읽기 전용 고정값 디렉터리.
import { buildSync } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export { TEST_REGISTRY, sampleReader, writingReader } from "./local-readers";

export const SRC = path.resolve(__dirname, "../..");
export const LOCAL_SRC = path.join(SRC, "local");
export const SAMPLE_FIXTURE = path.join(SRC, "__tests__/fixtures/local-sample");
export const REPO_ROOT = path.resolve(SRC, "../../..");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "pl-local-"));

/** esbuild 로 번들 하나(시험은 build 보다 먼저 돈다 — CI apps-adv 순서) */
export function bundle(entry: string): string {
  const out = path.join(tmp(), "out.cjs");
  buildSync({ entryPoints: [entry], bundle: true, platform: "node", target: "node20", outfile: out, logLevel: "silent" });
  return out;
}

/**
 * 쓰기 0 시험 ② 의 금지 목록 — 015 §3-2 의 열거 + 같은 일을 하는 다른 이름. 열기(open)도 금지다 — fd 가 없으면 fs.write 계열도 쓸 수 없다.
 * env 도 금지 — 호스트는 위치를 args 로만 받는다(015 §3-1 원칙 1).
 */
export const WRITE_API = [
  /\bwriteFile(Sync)?\b/, /\bappendFile(Sync)?\b/, /\bwriteSync\b/, /\bwritev(Sync)?\b/, /\bcreateWriteStream\b/,
  /\brename(Sync)?\b/, /\brm(Sync)?\s*\(/, /\brmdir(Sync)?\b/, /\bunlink(Sync)?\b/, /\bmkdir(Sync)?\b/, /\bmkdtemp(Sync)?\b/,
  /\bcopyFile(Sync)?\b/, /\bcp(Sync)?\s*\(/, /\bsymlink(Sync)?\b/, /\blink(Sync)?\s*\(/, /\btruncate(Sync)?\b/, /\bftruncate(Sync)?\b/,
  /\bchmod(Sync)?\b/, /\bchown(Sync)?\b/, /\butimes(Sync)?\b/, /\bopen(Sync)?\s*\(/, /\bopendir(Sync)?\b/,
  /child_process/, /\bspawn(Sync)?\b/, /\bexec(File)?(Sync)?\s*\(/, /\bfork\s*\(/,
  /\beval\s*\(/, /\bnew\s+Function\b/, /\bimport\s*\(/, /process\.env\b/,
];

export const writeApiHits = (text: string): string[] => WRITE_API.filter((re) => re.test(text)).map(String);

/** 번들이 부르는 모듈 — 노드 내장 중 허용한 것만이어야 한다(의존 패키지 · 네트워크 · 프로세스 모듈 0) */
export const requiresOf = (text: string): string[] => [...new Set([...text.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]))].sort();

/** 고정값을 복사해 500/400 으로 — 쓰기를 시도하는 리더는 EACCES 로 실패한다. done() 이 지운다 */
export function readOnlyCopy(fixture: string): { dir: string; done: () => void } {
  const root = tmp();
  const dir = path.join(root, "ro");
  fs.cpSync(fixture, dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.chmodSync(path.join(dir, f), 0o400);
  fs.chmodSync(dir, 0o500);
  return {
    dir,
    done: () => {
      fs.chmodSync(dir, 0o700);
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/** 시험 호스트 진입점 — 시험 레지스트리를 싣는다(운영 host-main 은 READERS 만) */
export const TEST_HOST_ENTRY = path.join(SRC, "__tests__/helpers/local-test-host.ts");
