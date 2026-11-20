// #872 · 015 V-4a — `local` 제공자의 "쓰기 0" 시험 세 겹(015 §3-2 K-2 · §8-3 WP-1). 필수 apps-adv job 안에서 돈다.
// 판정기에는 등급이 없다 — `mcp` 제공자는 앱의 /mcp/read 가 구조로 지키지만 `local` 은 통합 층 자기 코드라 시험이 지킨다.
//   ① 이름 — 리더가 등록하는 이름 ⊆ 그 선언의 read ∪ propose · write 는 늘 빈 배열
//   ② 쓰기 API 정적 금지 — src/local/** 소스와 호스트 번들(의존 포함 · 015 §13 #3)에 쓰기 · 열기 · 프로세스 · 동적 코드 · env 0
//   ③ 읽기 전용 고정값 디렉터리(500/400) — 모든 리더의 모든 도구가 성공한다(이름은 그대로인 채 파일을 쓰는 회귀 · AU2:34)
// 운영 레지스트리는 비어 있다(V-4a) — ① · ③ 은 리더가 더해지는 순간(V-5 · V-6) 그 리더에 걸린다. 같은 판정 함수를 시험 리더로 양성 · 음성 대조한다.
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseDomain } from "../domains";
import { mismatchOf } from "../local/fields";
import { callTool } from "../local/host";
import { READERS, Reader } from "../local/readers";
import { openStdioSession } from "../mcp-client";
import {
  LOCAL_SRC, REPO_ROOT, SAMPLE_FIXTURE, SRC, TEST_HOST_ENTRY, bundle, readOnlyCopy, requiresOf, sampleReader, writeApiHits, writingReader,
} from "./helpers/local";

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
  it("운영 리더마다 — 허용 선언이 저장소에 있으면 그 선언과 대조한다(V-4a 는 리더 0)", () => {
    for (const r of READERS.values()) {
      const file = path.join(REPO_ROOT, r.allowedDecl, "domain.json");
      if (fs.existsSync(file)) expect(namesProblems(r, fs.readFileSync(file, "utf8")), r.id).toEqual([]);
      else expect(r.tools.every((t) => KEY.test(t.name)), r.id).toBe(true);
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

  it("src/local/** 는 local 밖의 통합 층 모듈을 import 하지 않는다(봇 · 비공개 디렉터리 · 세션 기록에는 쓰기가 있다)", () => {
    for (const f of sources()) {
      const imports = [...fs.readFileSync(f, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const i of imports) expect(i.startsWith("./") || i === "node:fs" || i === "node:path", `${path.relative(SRC, f)} → ${i}`).toBe(true);
    }
  });

  it("호스트 번들(의존 포함)도 같다 · 부르는 모듈 ⊆ node:fs · node:path", () => {
    const js = fs.readFileSync(bundle(path.join(LOCAL_SRC, "host-main.ts")), "utf8");
    expect(writeApiHits(js)).toEqual([]);
    expect(requiresOf(js).filter((m) => m !== "node:fs" && m !== "node:path")).toEqual([]);
  });

  it("양성 대조 — 검사가 실제로 잡는다", () => {
    expect(writeApiHits(fs.readFileSync(path.join(SRC, "__tests__/helpers/local-readers.ts"), "utf8"))).toContain(String(/\bwriteFile(Sync)?\b/));
    for (const s of ["fs.openSync(p, 'w')", "require('node:child_process')", "await import(x)", "process.env.X", "fs.promises.rm(d)", "fs.renameSync(a,b)"]) {
      expect(writeApiHits(s).length, s).toBeGreaterThan(0);
    }
    expect(requiresOf('require("node:fs");require("node:net")')).toEqual(["node:fs", "node:net"]);
  });
});

describe("③ 읽기 전용 고정값 디렉터리 — 모든 도구 성공", () => {
  /** 리더의 모든 도구를 examples 인자로 — 실패한 도구 이름 목록 */
  const failing = (r: Reader, dir: string) => r.tools.map((t) => t.name).filter((n) => {
    const res = callTool(r, dir, n, r.examples[n] ?? {}, () => undefined);
    return res.isError === true;
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
