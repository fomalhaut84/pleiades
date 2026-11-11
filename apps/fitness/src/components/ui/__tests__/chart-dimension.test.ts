// 회귀: pleiades#588 — fit 웹 stderr 의 Recharts `width(-1) and height(-1)` 경고(SSR).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CHART_INITIAL_DIMENSION } from "../chart-dimension";

const SIZE_WARNING = /should be greater than 0/;

function renderChart(initialDimension?: { width: number; height: number }): string {
  const chart = createElement(LineChart, { data: [{ v: 1 }, { v: 2 }] }, createElement(Line, { dataKey: "v" }));
  return renderToString(
    // eslint-disable-next-line react/no-children-prop -- JSX 없는 .ts 에서 ResponsiveContainer Props 는 children 을 필수로 요구한다
    createElement(ResponsiveContainer, { width: "100%", height: "100%", initialDimension, children: chart }),
  );
}

function sizeWarnings(spy: ReturnType<typeof vi.spyOn>): number {
  return spy.mock.calls.filter((args: unknown[]) => SIZE_WARNING.test(String(args[0]))).length;
}

describe("CHART_INITIAL_DIMENSION", () => {
  afterEach(() => vi.restoreAllMocks());

  it("기본 initialDimension 은 SSR 에서 크기 경고를 낸다(전제 확인)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderChart();
    expect(sizeWarnings(warn)).toBeGreaterThan(0);
  });

  it("상수를 주면 SSR 크기 경고가 없다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderChart(CHART_INITIAL_DIMENSION);
    expect(sizeWarnings(warn)).toBe(0);
  });

  it("서버 출력은 기본값과 같다 — 측정 전에는 차트를 그리지 않는다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const withConstant = renderChart(CHART_INITIAL_DIMENSION);
    expect(withConstant).toBe(renderChart());
    expect(withConstant).not.toContain("<svg");
  });
});

describe("퍼센트 크기 ResponsiveContainer 사용처", () => {
  const SRC = join(__dirname, "..", "..", "..");
  const TAG = /<ResponsiveContainer\b[^>]*>/g;
  // 한계: 문자열 리터럴 크기(width="100%")만 본다 — width={"100%"} 나 태그 안 `>`(화살표 함수 props)는 놓친다
  const PERCENT = /\bwidth="\d+%"[^>]*\bheight="\d+%"|\bheight="\d+%"[^>]*\bwidth="\d+%"/;

  function tsxFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "__tests__" ? [] : tsxFiles(path);
      return path.endsWith(".tsx") ? [path] : [];
    });
  }

  it("너비·높이가 모두 퍼센트면 initialDimension 을 준다", () => {
    const tags = tsxFiles(SRC).flatMap((file) =>
      (readFileSync(file, "utf8").match(TAG) ?? []).map((tag) => ({ file, tag })),
    );
    const percent = tags.filter(({ tag }) => PERCENT.test(tag));
    expect(percent.length).toBeGreaterThan(0);
    expect(percent.filter(({ tag }) => !tag.includes("initialDimension"))).toEqual([]);
  });
});
