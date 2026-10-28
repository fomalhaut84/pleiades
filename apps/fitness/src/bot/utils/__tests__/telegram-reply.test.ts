import { describe, expect, it, vi } from "vitest";
import { InlineKeyboard } from "grammy";
import { htmlReply, plainReply } from "../../core/reply";
import { sendTelegramReply, telegramButtonOutput, telegramReplyArgs, toInlineKeyboard } from "../telegram-reply";

// pleiades 009 D-2 PR-2 (pleiades#364): 중립 응답 모델 → grammY 인자 — 리팩터 전 핸들러가 쓰던 옵션 모양 그대로

describe("telegramReplyArgs", () => {
  it("plain · 옵션 없음 → 인자 1개", () => {
    expect(telegramReplyArgs(plainReply("a"))).toEqual(["a"]);
  });

  it("html → parse_mode", () => {
    expect(telegramReplyArgs(htmlReply("<b>a</b>"))).toEqual(["<b>a</b>", { parse_mode: "HTML" }]);
  });

  it("버튼 → InlineKeyboard(행 구분)", () => {
    const rows = [
      [
        { label: "A", action: "x:1" },
        { label: "B", action: "x:2" },
      ],
      [{ label: "C", action: "x:3" }],
    ];
    expect(telegramReplyArgs(plainReply("t", { buttons: rows }))).toEqual([
      "t",
      { reply_markup: new InlineKeyboard().text("A", "x:1").text("B", "x:2").row().text("C", "x:3") },
    ]);
    expect(toInlineKeyboard(rows).inline_keyboard).toHaveLength(2);
  });

  it("clearKeyboard → remove_keyboard · 버튼이 있으면 버튼이 이긴다", () => {
    expect(telegramReplyArgs(plainReply("t", { clearKeyboard: true }))).toEqual([
      "t",
      { reply_markup: { remove_keyboard: true } },
    ]);
    const both = telegramReplyArgs(plainReply("t", { clearKeyboard: true, buttons: [[{ label: "A", action: "a" }]] }));
    expect(both[1]).toEqual({ reply_markup: new InlineKeyboard().text("A", "a") });
  });
});

describe("sendTelegramReply", () => {
  it("long html → 4096 분할 · 각 조각 parse_mode", async () => {
    const reply = vi.fn(async () => ({}));
    await sendTelegramReply({ reply }, htmlReply(`${"a".repeat(3000)}\n${"b".repeat(3000)}`, { long: true }));
    expect(reply).toHaveBeenCalledTimes(2);
    expect(reply.mock.calls[0]).toEqual(["a".repeat(3000), { parse_mode: "HTML" }]);
  });
});

describe("telegramButtonOutput", () => {
  it("notice() 는 인자 없이 · notice(text) 는 { text } · removeButtons 는 reply_markup undefined", async () => {
    const ctx = {
      reply: vi.fn(async () => ({})),
      answerCallbackQuery: vi.fn(async () => true),
      editMessageReplyMarkup: vi.fn(async () => true),
    };
    const out = telegramButtonOutput(ctx);
    await out.notice();
    await out.notice("hi");
    await out.removeButtons();
    expect(ctx.answerCallbackQuery.mock.calls).toEqual([[], [{ text: "hi" }]]);
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith({ reply_markup: undefined });
  });

  it("typing — replyWithChatAction 이 없으면 아무것도 안 한다", async () => {
    const out = telegramButtonOutput({
      reply: vi.fn(),
      answerCallbackQuery: vi.fn(),
      editMessageReplyMarkup: vi.fn(),
    });
    await expect(out.typing()).resolves.toBeUndefined();
  });
});
