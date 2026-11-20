// #872 · 015 V-4a — `local` 제공자의 "쓰기 0" 시험 세 겹(015 §3-2 K-2 · §8-3 WP-1). 필수 apps-adv job 안에서 돈다.
// 판정기에는 등급이 없다 — `mcp` 제공자는 앱의 /mcp/read 가 구조로 지키지만 `local` 은 통합 층 자기 코드라 시험이 지킨다.
//   ① 이름 — 리더가 등록하는 이름 ⊆ 그 선언의 read ∪ propose · write 는 늘 빈 배열
//   ② 쓰기 API 정적 금지 — src/local/** 소스와 호스트 번들(의존 포함 · 015 §13 #3)에 쓰기 · 열기 · 프로세스 · 동적 코드 · env 0
//   ③ 읽기 전용 고정값 디렉터리(500/400) — 모든 리더의 모든 도구가 성공한다(이름은 그대로인 채 파일을 쓰는 회귀 · AU2:34)
// 운영 레지스트리는 비어 있다(V-4a) — ① · ③ 은 리더가 더해지는 순간(V-5 · V-6) 그 리더에 걸린다. 같은 판정 함수를 시험 리더로 양성 · 음성 대조한다.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseDomain } from "../domains";
import { mismatchOf } from "../local/fields";
import { callTool } from "../local/host";
import { READERS, Reader } from "../local/readers";
import { openStdioSession } from "../mcp-client";
import {
  LOCAL_SRC, REPO_ROOT, SAMPLE_FIXTURE, SRC, TEST_HOST_ENTRY, bundle, cleanupBundles, importSpecifiers, outsideWriter, readOnlyCopy,
  requireCounts, requiresOf, sampleReader, watchFsWrites, writeApiHits, writingReader,
} from "./helpers/local";

afterAll(cleanupBundles);

const FIXTURES = path.join(LOCAL_SRC, "__fixtures__");
const KEY = /^[a-z0-9_]{1,60}$/;

/** ① — 선언 텍스트와 리더를 대조한다. 문제 목록(빈 배열 = 통과) */
function namesProblems(reader: Reader, declText: string): string[] {
  const d = parseDomain(declText, {}, path.basename(reader.allowedDecl));
  const problems: string[] = [];
  if (d.kind !== "local") return ["선언 kind 가 local 이 아니다"];
  if (d.reader !== reader.id) problems.push("선언 reader 가 다르다");
  if (d.write.size) problems.push("local 선언 write 가 비어 있지 않다");
  const names = reader.tools.map((t) => t.name);
  if (new Set(names).size !== names.length) problems.push("도구 이름 중복");
  const read = new Set(JSON.parse(declText).tools.read as string[]);
  for (const n of names) {
    if (!KEY.test(n)) problems.push(`이름 형식 ${n}`);
    if (!read.has(n) && !d.propose.has(n)) problems.push(`선언에 없는 이름 ${n}`);
  }
  return problems;
}

const decl = (read: string[], write: string[] = []) => JSON.stringify({
  contract: "pleiades-domain/v1", id: "sample", name: "시험", kind: "local", summary: "시험 제공자",
  local: { reader: "sample" }, tools: { read, write, propose: [] },
});

describe("① 이름 ⊆ read ∪ propose", () => {
  it("운영 리더마다 — 허용 선언이 저장소에 있어야 하고 그 선언과 대조한다(V-4a 는 리더 0 · #872 9-1 M3)", () => {
    for (const r of READERS.values()) {
      const file = path.join(REPO_ROOT, r.allowedDecl, "domain.json");
      expect(fs.existsSync(file), `${r.id} 선언 ${r.allowedDecl}/domain.json`).toBe(true);
      expect(namesProblems(r, fs.readFileSync(file, "utf8")), r.id).toEqual([]);
    }
  });

  it("양성 · 음성 대조 — 같은 판정 함수", () => {
    expect(namesProblems(sampleReader, decl(["sample_status", "sample_events"]))).toEqual([]);
    expect(namesProblems(sampleReader, decl(["sample_status"]))).toEqual(["선언에 없는 이름 sample_events"]);
    expect(() => namesProblems(sampleReader, decl(["sample_status", "sample_events"], ["x_write"]))).toThrow(/write/); // 파서가 먼저 거부
  });
});

describe("② 쓰기 API 정적 금지", () => {
  const sources = () => fs.readdirSync(LOCAL_SRC, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => path.join(e.parentPath, e.name));

  it("src/local/** 소스(주석 포함)에 쓰기 · 열기 · 프로세스 · 동적 코드 · env 가 없다", () => {
    const files = sources();
    expect(files.map((f) => path.relative(SRC, f))).toEqual(expect.arrayContaining(["local/fields.ts", "local/host.ts", "local/host-main.ts", "local/readers.ts"]));
    for (const f of files) expect(writeApiHits(fs.readFileSync(f, "utf8")), path.relative(SRC, f)).toEqual([]);
  });

  // 리더는 fields 도우미로만 읽는다(015 §3-1 원칙 3) — node:fs 를 import 할 수 있는 파일은 fields.ts 하나(#872 9-1 M1)
  const ALLOWED_IMPORTS: Readonly<Record<string, readonly string[]>> = {
    "fields.ts": ["node:fs", "node:path"],
  };
  const DEFAULT_IMPORTS = ["./fields", "./readers", "./host", "node:path"];

  it("src/local/** 의 import 는 허용 목록뿐 · node:fs 는 fields.ts 만 · .. 없음 · 변수 require 없음", () => {
    for (const f of sources()) {
      const text = fs.readFileSync(f, "utf8");
      const rel = path.relative(LOCAL_SRC, f);
      const allowed = ALLOWED_IMPORTS[rel] ?? DEFAULT_IMPORTS;
      for (const i of importSpecifiers(text)) {
        expect(i.includes(".."), `${rel} → ${i}`).toBe(false);
        expect(allowed, `${rel} → ${i}`).toContain(i);
      }
      const c = requireCounts(text);
      expect(c.all, rel).toBe(c.literal);
    }
  });

  it("호스트 번들(의존 포함)도 같다 · 부르는 모듈 ⊆ node:fs · node:path", () => {
    const js = fs.readFileSync(bundle(path.join(LOCAL_SRC, "host-main.ts")), "utf8");
    expect(writeApiHits(js)).toEqual([]);
    expect(requiresOf(js).filter((m) => m !== "node:fs" && m !== "node:path")).toEqual([]);
    const c = requireCounts(js);
    expect(c.all).toBe(c.literal); // 변수로 부르는 require 가 없다(requiresOf 가 못 보는 길)
  });

  it("양성 대조 — 검사가 실제로 잡는다", () => {
    expect(writeApiHits(fs.readFileSync(path.join(SRC, "__tests__/helpers/local-readers.ts"), "utf8"))).toContain(String(/\bwriteFile(Sync)?\b/));
    for (const s of ["fs.openSync(p, 'w')", "require('node:child_process')", "await import(x)", "process.env.X", "fs.promises.rm(d)", "fs.renameSync(a,b)",
      "fs.lchmodSync(p, 0)", "fs.fchownSync(fd, 0, 0)", "fs.mkdtempDisposableSync(p)", "new fs.WriteStream(p)", 'fs["write" + "FileSync"](p, x)',
      'process["env"]', "const { env } = process", 'process.binding("fs")', "createRequire(x)", "module.require(x)", "Reflect.get(fs, k)",
      'import("node:fs/promises")', "globalThis.process"]) {
      expect(writeApiHits(s).length, s).toBeGreaterThan(0);
    }
    expect(requiresOf('require("node:fs");require("node:net")')).toEqual(["node:fs", "node:net"]);
    expect(requireCounts('require("node:fs"); require(name)')).toEqual({ all: 2, literal: 1 });
    expect(importSpecifiers('import "node:net";\nimport x = require("./../a");\nimport { y } from "./b";').sort()).toEqual(["./../a", "./b", "node:net"]);
  });
});

describe("③ 읽기 전용 고정값 디렉터리 — 모든 도구 성공", () => {
  /** 리더의 모든 도구를 examples 인자로 — 쓰기 감시 아래에서. 실패하거나 쓰기를 시도한 도구 이름 목록 */
  const failing = (r: Reader, dir: string) => r.tools.map((t) => t.name).filter((n) => {
    const { value, writes } = watchFsWrites(() => callTool(r, dir, n, r.examples[n] ?? {}, () => undefined));
    return value.isError === true || writes.length > 0;
  });

  it("운영 리더마다 고정값 디렉터리 · 도구마다 예시 인자가 있다", () => {
    for (const r of READERS.values()) {
      expect(fs.existsSync(path.join(FIXTURES, r.id)), r.id).toBe(true);
      for (const t of r.tools) expect(r.examples[t.name], `${r.id}.${t.name}`).toBeDefined();
    }
  });

  it("운영 리더마다 — 500/400 사본에서 모든 도구 성공 · 불일치 0", () => {
    for (const r of READERS.values()) {
      const ro = readOnlyCopy(path.join(FIXTURES, r.id));
      try {
        expect(failing(r, ro.dir), r.id).toEqual([]);
        for (const t of r.tools) expect(mismatchOf(r.call(t.name, r.examples[t.name] ?? {}, ro.dir).tally), `${r.id}.${t.name}`).toBe(0);
      } finally {
        ro.done();
      }
    }
  });

  it("양성 · 음성 대조 — 읽기 리더는 통과 · 쓰기를 시도하는 리더는 실패로 드러난다", () => {
    const ro = readOnlyCopy(SAMPLE_FIXTURE);
    try {
      expect(failing(sampleReader, ro.dir)).toEqual([]);
      expect(failing(writingReader, ro.dir)).toEqual(["writer_touch"]);
      expect(failing(outsideWriter, ro.dir)).toEqual(["outside_touch"]); // 고정값 밖 쓰기 — 쓰기 감시가 잡는다(파일은 생기지 않는다)
      expect(watchFsWrites(() => fs.readFileSync(path.join(ro.dir, "state.json"), "utf8")).writes).toEqual([]); // 읽기는 감시에 걸리지 않는다
      expect(fs.readdirSync(ro.dir).sort()).toEqual(["events.jsonl", "state.json"]);
    } finally {
      ro.done();
    }
  });

  describe("별 프로세스 호스트로도 같다(CLI 가 띄우는 길)", () => {
    let hostJs = "";
    beforeAll(() => {
      hostJs = bundle(TEST_HOST_ENTRY);
    });
    it("500/400 사본에서 시험 리더의 모든 도구가 stdio 로 성공한다", async () => {
      const ro = readOnlyCopy(SAMPLE_FIXTURE);
      const s = await openStdioSession(process.execPath, [hostJs, "--reader", "sample", "--dir", ro.dir], 5000);
      try {
        for (const t of sampleReader.tools) {
          const r = await s.call("tools/call", { name: t.name, arguments: sampleReader.examples[t.name] });
          expect(r.isError, t.name).toBeUndefined();
        }
      } finally {
        await s.close();
        ro.done();
      }
    });
  });
});
