// #680 — 진입점: 사용법 · 키 형식. 실제 실행 경로(probe · ask)는 advisor.test 가 코어로 본다.
import { describe, expect, it } from "vitest";
import { USAGE, main } from "../main";

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
