// #872 · 015 V-4a — `local` 호스트 · 읽기 도우미 · stdio 클라이언트 · H-R4 · 기동 상한.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyTally, fileIn, pick, pickJson, pickLines } from "../local/fields";
import { FAILED_TEXT, LOCAL_INIT_MAX_MS, MISMATCH_TEXT, REQUEST_MAX_BYTES, parseHostArgs, runHost } from "../local/host";
import { READERS } from "../local/readers";
import { MAX_BODY_BYTES, openStdioSession } from "../mcp-client";
import { SAMPLE_FIXTURE, TEST_HOST_ENTRY, TEST_REGISTRY, bundle, cleanupBundles } from "./helpers/local";

afterAll(cleanupBundles);

describe("fields — 허용 목록 · 불일치 개수", () => {
  const shape = { required: { at: "string" as const }, optional: { n: "number" as const } };

  it("모르는 필드는 버리고 센다 · 새 객체를 돌려준다", () => {
    const t = emptyTally();
    const src = { at: "x", n: 1, secret: "s", text: "t" };
    const r = pick(src, shape, t);
    expect(r).toEqual({ at: "x", n: 1 });
    expect(r).not.toBe(src);
    expect(t).toEqual({ unknown: 2, missing: 0, broken: 0 });
  });

  it("필수가 빠지면 레코드를 버린다 · 선택 필드 형이 다르면 그 필드만 버린다", () => {
    const t = emptyTally();
    expect(pick({ n: 1 }, shape, t)).toBeNull();
    expect(pick({ at: "x", n: "1" }, shape, t)).toEqual({ at: "x" });
    expect(t.missing).toBe(2);
  });

  it("JSON 줄 — 깨진 줄(append 중 부분 줄)은 세고 건너뛴다 · 빈 줄은 세지 않는다", () => {
    const t = emptyTally();
    expect(pickLines('{"at":"a"}\n\n{"at":"b"}\n{"at":"c', shape, t)).toEqual([{ at: "a" }, { at: "b" }]);
    expect(t.broken).toBe(1);
    const t2 = emptyTally();
    expect(pickJson("[1]", shape, t2)).toBeNull();
    expect(t2.broken).toBe(1);
  });

  it("파일 이름은 정확한 이름 하나만 — 경로 · .. · 숨김 이름 거부", () => {
    expect(fileIn("/d", "state.json")).toBe(path.join("/d", "state.json"));
    for (const bad of ["../x", "a/b", ".hidden", "a..b", ""]) expect(() => fileIn("/d", bad)).toThrow();
  });
});

describe("parseHostArgs", () => {
  it("--reader <id> --dir <절대경로> 만 받는다", () => {
    expect(parseHostArgs(["--reader", "ops", "--dir", "/x"])).toEqual({ reader: "ops", dir: "/x" });
    for (const bad of [[], ["--reader", "ops"], ["--reader", "Ops", "--dir", "/x"], ["--reader", "ops", "--dir", "rel"], ["--dir", "/x", "--reader", "ops"], ["--reader", "ops", "--dir", "/x", "y"]]) {
      expect(parseHostArgs(bad)).toBeNull();
    }
  });
});

/** 같은 프로세스 안 — 스트림으로 요청을 넣고 응답 줄을 모은다 */
function inProcess(dir: string) {
  const input = new PassThrough();
  const out: Record<string, unknown>[] = [];
  const err: string[] = [];
  let ended = 0;
  runHost(TEST_REGISTRY, "sample", dir, { input, write: (l) => out.push(JSON.parse(l)), err: (l) => err.push(l), onEnd: () => ended++ });
  const send = async (msgs: unknown[]) => {
    input.write(msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
    await new Promise((r) => setImmediate(r));
  };
  return { input, out, err, send, ended: () => ended };
}

describe("runHost — 프로토콜", () => {
  it("운영 레지스트리 = ops 하나(#880 V-5 · hermes 는 V-6) · 없는 리더는 던진다", () => {
    expect([...READERS.keys()]).toEqual(["ops"]);
    expect(READERS.get("ops")!.allowedDecl).toBe("deploy/ops");
    expect(() => runHost(READERS, "sample", "/x", { input: new PassThrough(), write: () => undefined, err: () => undefined, onEnd: () => undefined })).toThrow();
  });

  it("initialize · tools/list · tools/call · 알림 무응답 · 모르는 도구 · 모르는 메서드", async () => {
    const h = inProcess(SAMPLE_FIXTURE);
    await h.send([
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "sample_events", arguments: { app: "fit" } } },
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope" } },
      { jsonrpc: "2.0", id: 5, method: "resources/list" },
    ]);
    expect(h.out.map((m) => m.id)).toEqual([1, 2, 3, 4, 5]);
    expect(h.out[0]).toMatchObject({ result: { protocolVersion: "2025-03-26", capabilities: { tools: {} } } });
    expect((h.out[1].result as { tools: { name: string }[] }).tools.map((t) => t.name)).toEqual(["sample_status", "sample_events"]);
    const call = h.out[2].result as { content: { text: string }[]; isError?: boolean };
    expect(call.isError).toBeUndefined();
    expect(JSON.parse(call.content[0].text)).toEqual([{ at: "2026-11-20T02:00:00Z", type: "anomaly", app: "fit", count: 3 }]);
    expect(h.out[3]).toMatchObject({ error: { code: -32602 } });
    expect(h.out[4]).toMatchObject({ error: { code: -32601 } });
    expect(h.err).toEqual([]);
  });

  it("형식 불일치 = 도구 결과 실패 + stderr 개수 줄(원문 0 · 015 §3-1 원칙 3)", async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "pl-mis-"));
    try {
      fs.writeFileSync(path.join(d, "events.jsonl"), '{"at":"a","type":"t","title":"원문 비밀"}\n{"at":\n');
      const h = inProcess(d);
      await h.send([{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "sample_events" } }]);
      expect(h.out[0].result).toEqual({ content: [{ type: "text", text: MISMATCH_TEXT }], isError: true });
      expect(h.err).toEqual(["[local-host] reader=sample tool=sample_events mismatch unknown=1 missing=0 broken=1"]);
      expect(h.err.join("")).not.toContain("원문");
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("읽기 실패 = 도구 결과 실패 + 코드만(경로 · 메시지 없음)", async () => {
    const h = inProcess("/nonexistent/pl-local");
    await h.send([{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "sample_status" } }]);
    expect(h.out[0].result).toEqual({ content: [{ type: "text", text: FAILED_TEXT }], isError: true });
    expect(h.err).toEqual(["[local-host] reader=sample tool=sample_status error=ENOENT"]);
  });

  it("깨진 요청 줄은 parse error · stdin 이 닫히면 onEnd", async () => {
    const h = inProcess(SAMPLE_FIXTURE);
    h.input.write("not json\n");
    await new Promise((r) => setImmediate(r));
    expect(h.out).toEqual([{ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }]);
    h.input.end();
    await new Promise((r) => setImmediate(r));
    expect(h.ended()).toBeGreaterThan(0);
  });

  it("상한을 넘은 줄 — 줄 끝과 한 청크든 나뉘어 오든 해석하지 않고 버린다 · 다음 줄은 받는다", async () => {
    const big = `{"jsonrpc":"2.0","id":7,"method":"ping","x":"${"a".repeat(REQUEST_MAX_BYTES)}"}`;
    const h = inProcess(SAMPLE_FIXTURE);
    h.input.write(`${big}\n`); // 한 청크
    h.input.write(big.slice(0, REQUEST_MAX_BYTES + 5)); // 나뉘어 온다 — 줄 끝 전에 상한을 넘는다
    await new Promise((r) => setImmediate(r));
    h.input.write(`${big.slice(REQUEST_MAX_BYTES + 5)}\n`);
    await h.send([{ jsonrpc: "2.0", id: 9, method: "ping" }]);
    expect(h.out).toEqual([{ jsonrpc: "2.0", id: 9, result: {} }]);
    expect(h.err).toEqual(["[local-host] reader=sample request-too-large", "[local-host] reader=sample request-too-large"]);
  });
});

describe("별 프로세스 — stdio 클라이언트 · H-R4 · 기동 상한", () => {
  let hostJs = "";
  beforeAll(() => {
    hostJs = bundle(TEST_HOST_ENTRY);
  });
  const args = (dir: string, delay?: number) => [hostJs, "--reader", "sample", "--dir", dir, ...(delay ? [String(delay)] : [])];

  it(`openStdioSession 왕복 · initialize 가 기동 상한(${LOCAL_INIT_MAX_MS} ms) 안`, async () => {
    const s = await openStdioSession(process.execPath, args(SAMPLE_FIXTURE), 5000);
    try {
      expect(s.initMs).toBeLessThan(LOCAL_INIT_MAX_MS);
      const list = await s.call("tools/list", {});
      expect((list.tools as { name: string }[]).map((t) => t.name)).toEqual(["sample_status", "sample_events"]);
      const r = await s.call("tools/call", { name: "sample_status", arguments: {} });
      expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({ updatedAt: "2026-11-20T00:00:00Z", queued: 2, sent: 10 });
      await expect(s.call("tools/call", { name: "nope" })).rejects.toThrow(/rpc/);
    } finally {
      await s.close();
    }
  });

  it("양성 대조 — 기동이 느린 호스트는 initMs 가 상한을 넘는다(V-4b 가 그것을 잡는다)", async () => {
    const s = await openStdioSession(process.execPath, args(SAMPLE_FIXTURE, LOCAL_INIT_MAX_MS + 200), 5000);
    try {
      expect(s.initMs).toBeGreaterThan(LOCAL_INIT_MAX_MS);
    } finally {
      await s.close();
    }
  });

  it("기한 안에 initialize 가 없으면 실패하고 자식을 남기지 않는다", async () => {
    const t0 = Date.now();
    await expect(openStdioSession(process.execPath, args(SAMPLE_FIXTURE, 3000), 200)).rejects.toThrow(/기한/);
    expect(Date.now() - t0).toBeLessThan(2500); // close 의 SIGKILL 유예 포함
  });

  // 회귀: PR #874 Codex P2 — 상한을 넘는 응답이 줄 끝과 한 청크로 오면 상한 검사 없이 해석됐다
  it("상한을 넘는 응답 줄은 청크 경계와 무관하게 실패한다", async () => {
    const big = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pl-big-")), "big.cjs");
    fs.writeFileSync(big, `process.stdin.once("data", () => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { x: "a".repeat(${MAX_BODY_BYTES}) } }) + "\\n"));`);
    try {
      await expect(openStdioSession(process.execPath, [big], 5000)).rejects.toThrow(/상한/);
    } finally {
      fs.rmSync(path.dirname(big), { recursive: true, force: true });
    }
  });

  it("띄우지 못하면 실패", async () => {
    await expect(openStdioSession("/nonexistent/node", [], 1000)).rejects.toThrow();
  });

  it("H-R4 — 부모가 stdin 을 닫으면(CLI SIGKILL) 호스트는 1 s 안에 스스로 끝난다", async () => {
    const child = spawn(process.execPath, args(SAMPLE_FIXTURE), { stdio: ["pipe", "pipe", "ignore"] });
    // 기동이 끝난 것을 응답으로 확인한 뒤 잰다 — 고정 대기는 느린 러너에서 기동 시간이 예산에 섞인다(#872 9-1 I5)
    const pong = new Promise<void>((r) => child.stdout.once("data", () => r()));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n`);
    await pong;
    const t0 = Date.now();
    const code = new Promise<number | null>((r) => child.once("exit", (c) => r(c)));
    child.stdin.end();
    const killer = setTimeout(() => child.kill("SIGKILL"), 3000);
    expect(await code).toBe(0);
    clearTimeout(killer);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
