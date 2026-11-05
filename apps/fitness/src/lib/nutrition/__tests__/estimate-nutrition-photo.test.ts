// #461: 사진은 @경로가 아니라 stream-json 이미지 본문으로 넘긴다 — 큰 사진이 모델에 닿지 않았다(운영 3회 · 로컬 재현)
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { spawn } from "child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claudeModelId } from "@/lib/ai/models";
import { estimateNutritionFromPhoto } from "../estimate-nutrition-photo";

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
const PDF_BYTES = Buffer.from("%PDF-1.7 not an image");

const VALID_ANSWER = JSON.stringify({
  items: [{ name: "김치찌개", kcal: 350, protein_g: 22, carbs_g: 15, fat_g: 20 }],
  total_kcal: 350,
  total_protein_g: 22,
  total_carbs_g: 15,
  total_fat_g: 20,
  confidence: "med",
});

function streamOutput(result: object): string {
  return [JSON.stringify({ type: "system", subtype: "init" }), JSON.stringify({ type: "result", ...result })].join("\n") + "\n";
}

interface FakeRun {
  args: string[][];
  written: string[];
  stdinEnded: () => boolean;
  stdin: EventEmitter;
}

function fakeSpawn(
  stdout: string,
  code: number | null = 0,
  opts: { stdinError?: Error } = {},
): { impl: typeof spawn; run: FakeRun } {
  const args: string[][] = [];
  const written: string[] = [];
  let ended = false;
  const stdin = Object.assign(new EventEmitter(), {
    write: (data: string) => {
      written.push(data);
      return true;
    },
    end: (data?: string) => {
      if (data !== undefined) written.push(data);
      ended = true;
    },
  });
  const impl = ((_bin: string, a: string[]) => {
    args.push(a);
    const child = Object.assign(new EventEmitter(), {
      stdin,
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });
    setImmediate(() => {
      if (opts.stdinError) stdin.emit("error", opts.stdinError);
      child.stdout.emit("data", Buffer.from(stdout));
      child.emit("close", code);
    });
    return child;
  }) as unknown as typeof spawn;
  return { impl, run: { args, written, stdinEnded: () => ended, stdin } };
}

describe("estimateNutritionFromPhoto", () => {
  let dir: string;
  let jpegPath: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "photo-test-"));
    jpegPath = path.join(dir, "meal.jpg");
    await fs.writeFile(jpegPath, JPEG_BYTES);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("회귀 #461: 이미지 본문을 stdin 으로 넘기고 프롬프트에 @경로를 쓰지 않는다", async () => {
    const { impl, run } = fakeSpawn(streamOutput({ result: VALID_ANSWER }));
    const estimate = await estimateNutritionFromPhoto(
      { imagePath: jpegPath, caption: "점심 찌개", mealType: "lunch" },
      { spawnImpl: impl },
    );

    expect(estimate?.kcal).toBe(350);
    expect(run.stdinEnded()).toBe(true);
    const payload = JSON.parse(run.written.join("")) as {
      type: string;
      message: { role: string; content: Array<Record<string, unknown>> };
    };
    expect(payload.type).toBe("user");
    expect(payload.message.role).toBe("user");
    const [image, text] = payload.message.content;
    expect(image).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: JPEG_BYTES.toString("base64") },
    });
    expect(text.type).toBe("text");
    expect(String(text.text)).toContain("사용자 캡션: 점심 찌개");
    expect(String(text.text)).toContain("식사 유형: 점심");
    expect(String(text.text)).not.toContain(jpegPath);
    expect(run.args[0].join(" ")).not.toContain(jpegPath);
  });

  it("도구 차단 · 1턴 · 고정 모델 · MCP 격리를 유지하고 stream-json 으로 호출한다", async () => {
    const { impl, run } = fakeSpawn(streamOutput({ result: VALID_ANSWER }));
    await estimateNutritionFromPhoto({ imagePath: jpegPath }, { spawnImpl: impl });

    const a = run.args[0];
    expect(a).toEqual(
      expect.arrayContaining(["-p", "--verbose", "--max-turns", "1", "--tools", "", "--strict-mcp-config"]),
    );
    expect(a[a.indexOf("--input-format") + 1]).toBe("stream-json");
    expect(a[a.indexOf("--output-format") + 1]).toBe("stream-json");
    expect(a[a.indexOf("--model") + 1]).toBe(claudeModelId("sonnet"));
  });

  it("지원하지 않는 형식이면 CLI 를 부르지 않는다 — 확장자가 아니라 내용으로 판정", async () => {
    const fakeJpeg = path.join(dir, "fake.jpg");
    await fs.writeFile(fakeJpeg, PDF_BYTES);
    const { impl, run } = fakeSpawn(streamOutput({ result: VALID_ANSWER }));
    await expect(estimateNutritionFromPhoto({ imagePath: fakeJpeg }, { spawnImpl: impl })).resolves.toBeNull();
    expect(run.args).toHaveLength(0);
  });

  it("파일을 읽지 못하면 CLI 를 부르지 않고 null", async () => {
    const { impl, run } = fakeSpawn(streamOutput({ result: VALID_ANSWER }));
    await expect(
      estimateNutritionFromPhoto({ imagePath: path.join(dir, "missing.jpg") }, { spawnImpl: impl }),
    ).resolves.toBeNull();
    expect(run.args).toHaveLength(0);
  });

  it("CLI 실패 · 오류 결과 · 결과 줄 없음 · 이미지를 못 봤다는 문장은 null", async () => {
    const cases = [
      fakeSpawn("", 1),
      fakeSpawn(streamOutput({ is_error: true, subtype: "error_max_turns" })),
      fakeSpawn(JSON.stringify({ type: "system", subtype: "init" }) + "\n"),
      fakeSpawn("not json at all\n"),
      fakeSpawn(streamOutput({ result: "이미지를 볼 수 없습니다." })),
    ];
    for (const { impl } of cases) {
      await expect(estimateNutritionFromPhoto({ imagePath: jpegPath }, { spawnImpl: impl })).resolves.toBeNull();
    }
  });

  it("CLI 가 먼저 죽어 stdin 쓰기가 실패해도 프로세스를 죽이지 않는다", async () => {
    const { impl } = fakeSpawn("", 1, { stdinError: new Error("write EPIPE") });
    await expect(estimateNutritionFromPhoto({ imagePath: jpegPath }, { spawnImpl: impl })).resolves.toBeNull();
  });

  it("회귀 #258: 실패 종료에서도 result 줄의 모델 드리프트를 경고한다", async () => {
    const warn = vi.mocked(console.warn);
    const { impl } = fakeSpawn(streamOutput({ is_error: true, modelUsage: { "claude-x": {} } }), 1);
    await expect(estimateNutritionFromPhoto({ imagePath: jpegPath }, { spawnImpl: impl })).resolves.toBeNull();
    expect(warn.mock.calls.flat().join("\n")).toContain("모델 드리프트");
  });

  it("빈 경로는 null", async () => {
    const { impl, run } = fakeSpawn("");
    await expect(estimateNutritionFromPhoto({ imagePath: "" }, { spawnImpl: impl })).resolves.toBeNull();
    expect(run.args).toHaveLength(0);
  });
});
