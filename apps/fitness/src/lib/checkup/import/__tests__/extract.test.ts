// #462: 결과지 이미지는 @경로가 아니라 stream-json 본문으로 넘긴다 — 큰 이미지가 모델에 닿지 않았다(#461 과 같은 결함 · 로컬 재현)
import { EventEmitter } from "node:events";
import type { spawn } from "child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claudeModelId } from "@/lib/ai/models";
import { extractCheckupPage } from "../extract";
import { buildExtractPrompt } from "../extract-prompt";

const IMAGE = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), type: "jpeg" } as const;
const SECRET_RESULT = "민감한 결과지 내용";
const VALID_PAGE = JSON.stringify({ institution: null, examDate: null, sections: [], items: [] });

function streamOutput(result: object): string {
  return [JSON.stringify({ type: "system", subtype: "init" }), JSON.stringify({ type: "result", ...result })].join("\n") + "\n";
}

function fakeSpawn(
  stdout: string,
  code: number | null = 0,
  opts: { signal?: NodeJS.Signals; stdinError?: Error } = {},
) {
  const args: string[][] = [];
  const written: string[] = [];
  const stdin = Object.assign(new EventEmitter(), {
    end: (data?: string) => {
      if (data !== undefined) written.push(data);
    },
  });
  const impl = ((_bin: string, a: string[]) => {
    args.push(a);
    const child = Object.assign(new EventEmitter(), { stdin, stdout: new EventEmitter() });
    setImmediate(() => {
      if (opts.stdinError) stdin.emit("error", opts.stdinError);
      child.stdout.emit("data", Buffer.from(stdout));
      child.emit("close", code, opts.signal ?? null);
    });
    return child;
  }) as unknown as typeof spawn;
  return { impl, args, written };
}

describe("extractCheckupPage", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("회귀 #462: 이미지 본문을 stdin 으로 넘기고 도구 차단 · 1턴 · 격리를 유지한다", async () => {
    const { impl, args, written } = fakeSpawn(streamOutput({ result: VALID_PAGE }));
    const result = await extractCheckupPage(IMAGE, { spawnImpl: impl });

    expect(result).toEqual({ ok: true, page: { institution: null, examDate: null, sections: [], items: [] } });
    const payload = JSON.parse(written.join("")) as { message: { content: Array<Record<string, unknown>> } };
    expect(payload.message.content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: Buffer.from(IMAGE.bytes).toString("base64") },
    });
    expect(payload.message.content[1]).toEqual({ type: "text", text: buildExtractPrompt() });
    const a = args[0];
    expect(a).toEqual(expect.arrayContaining(["-p", "--verbose", "--max-turns", "1", "--tools", "", "--strict-mcp-config"]));
    expect(a[a.indexOf("--input-format") + 1]).toBe("stream-json");
    expect(a[a.indexOf("--output-format") + 1]).toBe("stream-json");
    expect(a[a.indexOf("--model") + 1]).toBe(claudeModelId("sonnet"));
  });

  it("프롬프트에 @경로가 없다", () => {
    expect(buildExtractPrompt().startsWith("위 이미지는")).toBe(true);
  });

  it("실패 종류를 가른다 — 시간 초과 · CLI · 검증", async () => {
    const cases: Array<[ReturnType<typeof fakeSpawn>, string]> = [
      [fakeSpawn("", null, { signal: "SIGTERM" }), "timeout"],
      [fakeSpawn("", 1), "cli"],
      [fakeSpawn(streamOutput({ is_error: true, subtype: "error_max_turns" })), "cli"],
      [fakeSpawn("not json\n"), "cli"],
      [fakeSpawn(streamOutput({ result: "이미지를 볼 수 없습니다." })), "parse"],
    ];
    for (const [{ impl }, reason] of cases) {
      await expect(extractCheckupPage(IMAGE, { spawnImpl: impl })).resolves.toEqual({ ok: false, reason });
    }
  });

  it("실행 파일을 띄우지 못하면 spawn 실패로 가른다", async () => {
    const impl = (() => {
      const child = Object.assign(new EventEmitter(), {
        stdin: Object.assign(new EventEmitter(), { end: () => {} }),
        stdout: new EventEmitter(),
      });
      setImmediate(() => child.emit("error", new Error("spawn ENOENT")));
      return child;
    }) as unknown as typeof spawn;
    await expect(extractCheckupPage(IMAGE, { spawnImpl: impl })).resolves.toEqual({ ok: false, reason: "spawn" });
  });

  it("CLI 가 먼저 죽어 stdin 쓰기가 실패해도 프로세스를 죽이지 않는다", async () => {
    const { impl } = fakeSpawn("", 1, { stdinError: new Error("write EPIPE") });
    await expect(extractCheckupPage(IMAGE, { spawnImpl: impl })).resolves.toEqual({ ok: false, reason: "cli" });
  });

  it("회귀 #258: 실패 종료에서도 드리프트를 경고한다", async () => {
    const { impl } = fakeSpawn(streamOutput({ is_error: true, modelUsage: { "claude-x": {} } }), 1);
    await extractCheckupPage(IMAGE, { spawnImpl: impl });
    expect(vi.mocked(console.warn).mock.calls.flat().join("\n")).toContain("모델 드리프트");
  });

  it("검증 실패 로그에 응답 원문을 남기지 않는다 — 건강 데이터", async () => {
    const { impl } = fakeSpawn(streamOutput({ result: SECRET_RESULT }));
    await extractCheckupPage(IMAGE, { spawnImpl: impl });
    expect(vi.mocked(console.warn).mock.calls.flat().join("\n")).not.toContain(SECRET_RESULT);
  });
});
