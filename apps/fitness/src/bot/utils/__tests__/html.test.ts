import { describe, expect, it } from "vitest";
import { escapeHtml } from "../html";

// 1a-2 회귀 baseline (pleiades 003 §5-2 · pleiades#58). replyLong 은 009 D-5 B2(#504)에서 옛 어댑터와 함께 지웠다(분할은 chat).

// mdToHtml 은 013 P2-c(#760)에서 지웠다 — AI 장문은 markdown 형식으로 chat 정리기를 거친다.

describe("escapeHtml", () => {
  it("& < > 를 이스케이프한다", () => {
    expect(escapeHtml("a & <b> > c")).toBe("a &amp; &lt;b&gt; &gt; c");
  });

  it("따옴표는 건드리지 않는다", () => {
    expect(escapeHtml(`"q" 'q'`)).toBe(`"q" 'q'`);
  });
});
