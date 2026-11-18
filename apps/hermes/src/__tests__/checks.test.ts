// 014 §3-F F1 — 게시 전 검사(H-1b · #794). ② 토큰 형식은 수집기 · 승격 검사기와 같은 공통 벡터로 시험한다(세 판)
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkContent, collectSecrets, hasToken, POST_MAX } from "../checks";

type Piece = string | [string, number];
const VECTORS = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../../tools/ops/token_vectors.json"), "utf8"),
) as Record<string, Piece[][]>;
const expand = (v: Piece[]) => v.map((p) => (typeof p === "string" ? p : p[0].repeat(p[1]))).join("");

describe("② 토큰 형식 — 공통 벡터", () => {
  it.each(VECTORS.token.map((v) => [expand(v).slice(0, 24), expand(v)]))("token: %s…", (_l, text) => {
    expect(hasToken(text)).toBe(true);
    expect(checkContent(text, [])).toBe("token");
  });
  it.each(VECTORS.clean.map((v) => [expand(v)]))("clean: %s", (text) => {
    expect(hasToken(text)).toBe(false);
    expect(checkContent(text, [])).toBeNull();
  });
  it("escape 가 토큰을 끊어도 잡는다(벗긴 본문으로도 본다)", () => {
    const tok = expand(VECTORS.token[7]);
    expect(checkContent(tok.replace(/_/g, "\\_").replace(/g/, "\\g"), [])).toBe("token");
  });
});

describe("개인정보 — 전화 · 이메일(D11)", () => {
  it.each(VECTORS.pii.map((v) => [expand(v)]))("pii: %s", (text) => {
    expect(checkContent(text, [])).toBe("pii");
  });
  it.each(VECTORS.pii_clean.map((v) => [expand(v)]))("clean: %s", (text) => {
    expect(checkContent(text, [])).toBeNull();
  });
  it("escape 된 이메일도 잡는다", () => {
    expect(checkContent("a\\_b@example\\.com", [])).toBe("pii");
  });
});

describe("① 비밀 대조 · ③ 길이", () => {
  it("비밀 값이 들어 있으면 secret-match(escape 해도)", () => {
    const secrets = ["s3cr3t-value_xyz"];
    expect(checkContent("값은 s3cr3t-value_xyz 이다", secrets)).toBe("secret-match");
    expect(checkContent("값은 s3cr3t-value\\_xyz 이다", secrets)).toBe("secret-match");
    expect(checkContent("값은 다른 것", secrets)).toBeNull();
  });
  it("2000자 넘으면 length", () => {
    expect(checkContent("가".repeat(POST_MAX), [])).toBeNull();
    expect(checkContent("가".repeat(POST_MAX + 1), [])).toBe("length");
  });
});

describe("collectSecrets — 플랫폼 설정 + hermes env(D13)", () => {
  const hook = "https://discord.com/api/" + "webhooks/1/" + "abcdefABCDEF12345678";
  it("비밀 키만 · 8자 이상만 · 중복 없이", () => {
    const got = collectSecrets(
      { DISCORD_WEBHOOK_SPOT: hook, DISCORD_CHANNEL_ID_FINANCE: "123456789012345678", DISCORD_BOT_TOKEN_X: "short" },
      { HERMES_STATE_DIR: "/srv/state-dir-long", SOME_API_KEY: "k".repeat(12), PATH: "/usr/bin:/bin:/x", DISCORD_WEBHOOK_SPOT: hook },
    );
    expect(got.sort()).toEqual([hook, "k".repeat(12)].sort());
  });
});
