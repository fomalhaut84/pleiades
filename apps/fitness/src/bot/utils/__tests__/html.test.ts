import { describe, expect, it } from "vitest";
import { escapeHtml, mdToHtml } from "../html";

// 1a-2 회귀 baseline (pleiades 003 §5-2 · pleiades#58). replyLong 은 009 D-5 B2(#504)에서 옛 어댑터와 함께 지웠다(분할은 chat).

describe("mdToHtml", () => {
  it("헤더 · 굵게 · 기울임 · 코드 · 불릿을 변환한다", () => {
    expect(mdToHtml("### 제목")).toBe("<b>제목</b>");
    expect(mdToHtml("## 제목")).toBe("<b>제목</b>");
    expect(mdToHtml("# 제목")).toBe("<b>제목</b>");
    expect(mdToHtml("**굵게**")).toBe("<b>굵게</b>");
    expect(mdToHtml("*기울임*")).toBe("<i>기울임</i>");
    expect(mdToHtml("`코드`")).toBe("<code>코드</code>");
    expect(mdToHtml("목록\n- 항목")).toBe("목록\n• 항목");
  });

  it("마크다운이 없으면 원문을 유지한다", () => {
    expect(mdToHtml("plain")).toBe("plain");
  });
});

describe("escapeHtml", () => {
  it("& < > 를 이스케이프한다", () => {
    expect(escapeHtml("a & <b> > c")).toBe("a &amp; &lt;b&gt; &gt; c");
  });

  it("따옴표는 건드리지 않는다", () => {
    expect(escapeHtml(`"q" 'q'`)).toBe(`"q" 'q'`);
  });
});
