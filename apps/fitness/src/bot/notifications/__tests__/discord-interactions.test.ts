import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// pleiades M-6b-3 (pleiades#151) — Discord 버튼 → decideAutoAdjust(텔레그램과 같은 판단) → 본인 안내 · 수락/거절은 버튼 제거
vi.mock("../auto-adjust-callback", () => ({ decideAutoAdjust: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: {} }));

import { decideAutoAdjust } from "../auto-adjust-callback";
import { handleDiscordButton, startDiscordInteractions } from "../discord-interactions";

function ctx(customId: string) {
  return {
    customId,
    userId: "1",
    channelId: "2",
    messageId: "3",
    edit: vi.fn(async () => {}),
    reply: vi.fn(async () => {}),
    removeButtons: vi.fn(async () => {}),
  };
}

describe("handleDiscordButton", () => {
  beforeEach(() => vi.mocked(decideAutoAdjust).mockReset());

  it("수락 — 안내 후 버튼 제거", async () => {
    vi.mocked(decideAutoAdjust).mockResolvedValue({ notice: "✅ 반영", removeKeyboard: true });
    const c = ctx("auto_adjust:accept:adj1");
    await handleDiscordButton(c);
    expect(decideAutoAdjust).toHaveBeenCalledWith("auto_adjust:accept:adj1");
    expect(c.reply).toHaveBeenCalledWith("✅ 반영");
    expect(c.removeButtons).toHaveBeenCalledTimes(1);
  });

  it("스누즈 — 안내만 · 버튼 유지", async () => {
    vi.mocked(decideAutoAdjust).mockResolvedValue({ notice: "💤 1시간 뒤", removeKeyboard: false });
    const c = ctx("auto_adjust:snooze:adj1");
    await handleDiscordButton(c);
    expect(c.removeButtons).not.toHaveBeenCalled();
  });

  it("버튼 제거 실패는 무시(텔레그램과 같이)", async () => {
    vi.mocked(decideAutoAdjust).mockResolvedValue({ notice: "ok", removeKeyboard: true });
    const c = ctx("auto_adjust:reject:adj1");
    c.removeButtons.mockRejectedValue(new Error("404"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(handleDiscordButton(c)).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it("다른 접두사는 판단하지 않고 안내만", async () => {
    const c = ctx("vest:confirm:r1");
    await handleDiscordButton(c);
    expect(decideAutoAdjust).not.toHaveBeenCalled();
    expect(c.reply).toHaveBeenCalledWith("알 수 없는 요청입니다.");
  });
});

describe("startDiscordInteractions", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("토큰·채널이 없으면 시작하지 않는다", () => {
    vi.stubEnv("DISCORD_BOT_TOKEN_FITNESS", "");
    vi.stubEnv("DISCORD_CHANNEL_ID_FITNESS", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(startDiscordInteractions()).toBeUndefined();
    log.mockRestore();
  });
});
