// #680 — 진입점: 사용법 · 키 형식. 실제 실행 경로(probe · ask)는 advisor.test 가 코어로 본다.
import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { USAGE, main, readAll } from "../main";

const run = async (argv: string[]) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, {}, (l) => out.push(l), (l) => err.push(l), async () => "q");
  return { code, out, err };
};

describe("advisor main", () => {
  it("모르는 명령 · 인자 수가 다르면 사용법과 2", async () => {
    for (const argv of [[], ["x"], ["probe", "extra"], ["ask", "1"]]) {
      expect(await run(argv)).toEqual({ code: 2, out: [], err: [USAGE] });
    }
  });

  it("ask 의 채널·사용자 ID 가 숫자가 아니면 2", async () => {
    expect((await run(["ask", "abc", "1"])).code).toBe(2);
  });
});

// 회귀: PR #684 Codex P2 — 청크 경계에 걸린 멀티바이트 문자
describe("readAll", () => {
  it("한글 한 글자가 두 청크로 나뉘어도 깨지지 않는다", async () => {
    const b = Buffer.from("수면 질문", "utf8");
    expect(await readAll(Readable.from([b.subarray(0, 1), b.subarray(1, 4), b.subarray(4)]))).toBe("수면 질문");
  });
});
