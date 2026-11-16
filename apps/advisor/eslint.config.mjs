// #679 · 012 4b-1 — 통합 층은 Next 앱이 아니다(봇 하나 · 웹 없음) — eslint-config-next 대신 typescript-eslint 권장 규칙.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  ignores: ["dist/**"],
});
