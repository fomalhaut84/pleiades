// 014 H-1a · #791 — hermes 는 Next 앱이 아니다(HTTP 서버 하나) — 통합 층(apps/advisor)과 같은 typescript-eslint 권장 규칙.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  ignores: ["dist/**"],
});
