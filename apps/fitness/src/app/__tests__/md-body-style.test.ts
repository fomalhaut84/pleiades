// 회귀: pleiades#753 (013 P1) — 리포트 · AI 답 마크다운이 `prose` 클래스로만 꾸며져 있었는데
// @tailwindcss/typography 가 없어 아무 스타일도 없었다(제목 크기 · 목록 기호 · 표 테두리 0).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..");
const CSS = readFileSync(join(SRC, "app", "globals.css"), "utf8");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : sources(p);
    return /\.(tsx|ts)$/.test(name) ? [p] : [];
  });
}

describe("마크다운 본문 스타일(md-body)", () => {
  it("typography 플러그인이 없으므로 prose 클래스를 쓰지 않는다", () => {
    // 문자열 리터럴 안의 prose · prose-* 를 모두 본다(className="…" · {"…"} · {`…`} · cn("…")) — 대문자 PROSE 상수 이름은 제외
    const users = sources(SRC).filter((f) => /["'`][^"'`\n]*\bprose(?:-[\w-]+)?\b[^"'`\n]*["'`]/.test(readFileSync(f, "utf8")));
    expect(users).toEqual([]);
  });

  it("dangerouslySetInnerHTML 로 마크다운을 넣는 곳은 md-body 를 쓴다", () => {
    const files = sources(SRC).filter((f) => /(marked|renderMarkdown)/.test(readFileSync(f, "utf8")) && /dangerouslySetInnerHTML/.test(readFileSync(f, "utf8")));
    expect(files.length).toBeGreaterThanOrEqual(5);
    // AiEvalCard 는 카드 크기에 맞춘 자체 스타일(PROSE 상수 · [&_ul]:list-disc 등)을 이미 쓴다
    const OWN_STYLE = ["AiEvalCard.tsx"];
    // 렌더 지점마다 — md-body 를 쓰는 className 수가 dangerouslySetInnerHTML 수보다 적으면 빠진 곳이 있다(주석만으로 통과하지 않게)
    const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
    const missing = files.filter((f) => {
      if (OWN_STYLE.some((n) => f.endsWith(n))) return false;
      const s = readFileSync(f, "utf8");
      return count(s, /className=["'`{][^>]*\bmd-body\b/g) < count(s, /dangerouslySetInnerHTML/g);
    });
    expect(missing).toEqual([]);
  });

  it.each([
    [".md-body h2", "font-size"],
    [".md-body ul", "list-style: disc"],
    [".md-body ol", "list-style: decimal"],
    [".md-body table", "overflow-x: auto"],
    [".md-body > :last-child", "margin-bottom: 0"],
    [".md-body td", "border-top"],
  ])("%s 에 %s 가 있다", (sel, rule) => {
    const re = new RegExp(`${sel.replace(/[.]/g, "\\.")}[^{]*\\{[^}]*${rule}`);
    expect(CSS).toMatch(re);
  });
});
