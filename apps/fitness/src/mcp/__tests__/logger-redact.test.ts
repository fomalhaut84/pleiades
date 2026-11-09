import pino from "pino";
import { describe, expect, it } from "vitest";
import { LOG_REDACT_PATHS, logger, summarizeArgs } from "../logger";

// 회귀: 009 D-5 A2 — 최상위 Discord 토큰·웹훅이 MCP 로그에 그대로 남지 않는다
describe("LOG_REDACT_PATHS", () => {
  const render = (fields: Record<string, unknown>): string => {
    let out = "";
    const log = pino(
      { redact: { paths: [...LOG_REDACT_PATHS], censor: "[REDACTED]" } },
      { write: (line: string) => { out += line; } },
    );
    log.info(fields, "m");
    return out;
  };

  it.each([
    "DISCORD_BOT_TOKEN_FINANCE",
    "DISCORD_BOT_TOKEN_FITNESS",
    "DISCORD_WEBHOOK_FINANCE",
    "DISCORD_WEBHOOK_FITNESS",
    "DISCORD_WEBHOOK_ADMIN",
    "DISCORD_WEBHOOK_DEPLOY",
    "GARMIN_PASSWORD",
    "OMRON_PASSWORD",
    "OMRON_APP_KEY",
    "MFDS_API_KEY",
  ])("%s 값을 가린다", (key) => {
    const line = render({ [key]: "SECRET-VALUE" });
    expect(line).not.toContain("SECRET-VALUE");
    expect(line).toContain("[REDACTED]");
  });

  it("다른 필드는 그대로 둔다", () => {
    expect(render({ ticker: "AAPL" })).toContain("AAPL");
  });
});

// pleiades#453 — 목록이 아니라 실제 logger 인스턴스가 가리는지, args 안 웹훅·api_key 도 가리는지
describe("MCP logger 인스턴스 redact", () => {
  it("logger 가 LOG_REDACT_PATHS 로 최상위 비밀을 가린다", () => {
    const holder = logger as unknown as Record<symbol, unknown>;
    const original = holder[pino.symbols.streamSym];
    const level = logger.level;
    logger.level = "info"; // MCP_LOG_LEVEL 이 높아도 기록되게(9-1 info)
    let out = "";
    holder[pino.symbols.streamSym] = { write: (s: string) => { out += s; } };
    try {
      logger.info({ GARMIN_PASSWORD: "SECRET-VALUE", MFDS_API_KEY: "SECRET-KEY" }, "m");
    } finally {
      holder[pino.symbols.streamSym] = original;
      logger.level = level;
    }
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("SECRET-VALUE");
    expect(out).not.toContain("SECRET-KEY");
  });

  it("summarizeArgs 가 args 안 웹훅 · api_key 키를 가린다", () => {
    expect(summarizeArgs({ webhookUrl: "https://hook/x", nested: { MFDS_API_KEY: "y", "api-key": "z" }, memo: "ok" })).toEqual({
      webhookUrl: "[REDACTED]",
      nested: { MFDS_API_KEY: "[REDACTED]", "api-key": "[REDACTED]" },
      memo: "ok",
    });
  });
});
