// `local` 호스트 시험 도우미 (#872 · 015 V-4a) — 시험 리더 · 번들 만들기 · 쓰기 API 검사 · 읽기 전용 고정값 디렉터리.
import { buildSync } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export { TEST_REGISTRY, outsideWriter, sampleReader, writingReader } from "./local-readers";

export const SRC = path.resolve(__dirname, "../..");
export const LOCAL_SRC = path.join(SRC, "local");
export const SAMPLE_FIXTURE = path.join(SRC, "__tests__/fixtures/local-sample");
export const REPO_ROOT = path.resolve(SRC, "../../..");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "pl-local-"));
const bundleDirs: string[] = [];

/** esbuild 로 번들 하나(시험은 build 보다 먼저 돈다 — CI apps-adv 순서) · 지우기는 cleanupBundles() */
export function bundle(entry: string): string {
  const dir = tmp();
  bundleDirs.push(dir);
  const out = path.join(dir, "out.cjs");
  buildSync({ entryPoints: [entry], bundle: true, platform: "node", target: "node20", outfile: out, logLevel: "silent" });
  return out;
}

export function cleanupBundles(): void {
  for (const d of bundleDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
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
  // #872 9-1 M1 — 경계로 빠지던 이름 · 다른 생성자 · 계산된 접근 · 원시 바인딩 · 모듈 로더
  /[lf]?chmod/, /[lf]?chown/, /[lf]?utimes/, /mkdtemp/, /\bWriteStream\b/, /fs\/promises/, /\.promises\b/,
  /\bprocess\s*\[/, /\{[^}]*\benv\b[^}]*\}\s*=\s*process/, /process\.(binding|_linkedBinding|dlopen|mainModule)/,
  /createRequire/, /module\.require/, /\bReflect\b/, /\bfs\s*\[/, /globalThis/,
];

export const writeApiHits = (text: string): string[] => WRITE_API.filter((re) => re.test(text)).map(String);

/** 번들이 부르는 모듈 — 노드 내장 중 허용한 것만이어야 한다(의존 패키지 · 네트워크 · 프로세스 모듈 0) */
export const requiresOf = (text: string): string[] => [...new Set([...text.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]))].sort();

/** require 호출 수와 문자열 인자 require 수 — 다르면 변수로 부르는 require 가 있다(requiresOf 가 못 보는 길 · #872 9-1 M1) */
export const requireCounts = (text: string) => ({
  all: (text.match(/\brequire\s*\(/g) ?? []).length,
  literal: (text.match(/\brequire\s*\(\s*["'][^"']+["']\s*\)/g) ?? []).length,
});

/** 소스의 모든 import 지정자 — from · 부수효과 import · require(import x = require 포함) */
export const importSpecifiers = (text: string): string[] => [
  ...text.matchAll(/\bfrom\s+["']([^"']+)["']/g),
  ...text.matchAll(/\bimport\s+["']([^"']+)["']/g),
  ...text.matchAll(/\brequire\s*\(\s*["']([^"']+)["']/g),
].map((m) => m[1]);

/** 디렉터리 트리 — 위에서 아래 순서(dirs[0] = 루트) */
function walk(dir: string): { dirs: string[]; files: string[] } {
  const dirs = [dir];
  const files: string[] = [];
  for (let i = 0; i < dirs.length; i++) {
    for (const e of fs.readdirSync(dirs[i], { withFileTypes: true })) {
      const p = path.join(dirs[i], e.name);
      if (e.isDirectory()) dirs.push(p);
      else files.push(p);
    }
  }
  return { dirs, files };
}

/** 고정값을 복사해 디렉터리 500 · 파일 400 으로(하위 디렉터리까지 · #872 9-1 M2) — 고정값 안 쓰기는 EACCES 로 실패한다. done() 이 지운다 */
export function readOnlyCopy(fixture: string): { dir: string; done: () => void } {
  const root = tmp();
  const dir = path.join(root, "ro");
  fs.cpSync(fixture, dir, { recursive: true });
  const { dirs, files } = walk(dir);
  for (const f of files) fs.chmodSync(f, 0o400);
  for (const d of [...dirs].reverse()) fs.chmodSync(d, 0o500); // 아래부터 — 위를 먼저 막으면 아래로 내려갈 수 없다
  return {
    dir,
    done: () => {
      for (const d of dirs) fs.chmodSync(d, 0o700); // 위부터 — 열어야 아래가 보인다
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/**
 * 층 ③ 의 둘째 눈 — node:fs 의 쓰기 계열 함수를 감싸 부르면 던지고 기록한다(#872 9-1 M1 ④).
 * 읽기 전용 디렉터리는 고정값 밖(예: tmpdir) 쓰기를 못 잡는다 — 같은 모듈 객체를 쓰므로 이것이 잡는다.
 * open 은 읽기 플래그면 그대로 둔다(readFileSync 가 안에서 fs.openSync 를 부르는 판이 있다).
 */
export const FS_WRITE_FNS = [
  "writeFileSync", "writeFile", "appendFileSync", "appendFile", "writeSync", "write", "writevSync", "writev", "createWriteStream",
  "renameSync", "rename", "rmSync", "rm", "rmdirSync", "rmdir", "unlinkSync", "unlink", "mkdirSync", "mkdir", "mkdtempSync", "mkdtemp",
  "copyFileSync", "copyFile", "cpSync", "cp", "symlinkSync", "symlink", "linkSync", "link", "truncateSync", "truncate",
  "ftruncateSync", "ftruncate", "chmodSync", "chmod", "lchmodSync", "lchmod", "fchmodSync", "fchmod", "chownSync", "chown",
  "lchownSync", "lchown", "fchownSync", "fchown", "utimesSync", "utimes", "lutimesSync", "lutimes", "futimesSync", "futimes",
] as const;
const PROMISE_WRITE_FNS = ["writeFile", "appendFile", "rename", "rm", "rmdir", "unlink", "mkdir", "mkdtemp", "copyFile", "cp", "symlink", "link", "truncate", "chmod", "lchmod", "chown", "lchown", "utimes", "lutimes", "open"] as const;
const readFlag = (flags: unknown) => flags === undefined || flags === "r" || flags === fs.constants.O_RDONLY;

export function watchFsWrites<T>(fn: () => T): { value: T; writes: string[] } {
  const writes: string[] = [];
  const restore: (() => void)[] = [];
  const wrap = (obj: Record<string, unknown>, name: string, label: string, allow?: (args: unknown[]) => boolean) => {
    const orig = obj[name];
    if (typeof orig !== "function") return;
    obj[name] = (...args: unknown[]) => {
      if (allow?.(args)) return (orig as (...a: unknown[]) => unknown).apply(obj, args);
      writes.push(label);
      throw new Error("쓰기 감시");
    };
    restore.push(() => {
      obj[name] = orig;
    });
  };
  const fsObj = fs as unknown as Record<string, unknown>;
  for (const n of FS_WRITE_FNS) wrap(fsObj, n, n);
  wrap(fsObj, "openSync", "openSync", (a) => readFlag(a[1]));
  wrap(fsObj, "open", "open", (a) => readFlag(typeof a[1] === "function" ? undefined : a[1]));
  const p = fs.promises as unknown as Record<string, unknown>;
  for (const n of PROMISE_WRITE_FNS) wrap(p, n, `promises.${n}`, n === "open" ? (a) => readFlag(a[1]) : undefined);
  try {
    return { value: fn(), writes };
  } finally {
    for (const r of restore.reverse()) r();
  }
}

/** 시험 호스트 진입점 — 시험 레지스트리를 싣는다(운영 host-main 은 READERS 만) */
export const TEST_HOST_ENTRY = path.join(SRC, "__tests__/helpers/local-test-host.ts");
