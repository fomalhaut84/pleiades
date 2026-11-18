// 014 H-1a · #791 — hermes 시험 러너. 두 앱 · 통합 층과 같은 위치 규칙(src/**/__tests__/**/*.test.ts · workflow.md 8-5).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // 개발자 PC 의 pleiades 루트 .env 가 시험으로 새지 않게(두 앱 · 통합 층과 같다)
    env: { PLEIADES_ENV_FILE: "/nonexistent/pleiades-test.env" },
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
