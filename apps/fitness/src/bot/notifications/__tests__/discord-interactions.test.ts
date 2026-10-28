import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// pleiades M-6b-3 (pleiades#151) — Discord 버튼 → decideAutoAdjust(텔레그램과 같은 판단) → 본인 안내 · 수락/거절은 버튼 제거
// pleiades 009 D-1 (pleiades#347) — gateway 를 @pleiades/chat 으로(action · notice · setButtons([]))
vi.mock("../auto-adjust-callback", () => ({ decideAutoAdjust: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: {} }));
// pleiades 009 D-2 PR-3 (pleiades#367): createChat 옵션만 본다 — gateway 를 띄우지 않는다
vi.mock("@pleiades/chat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pleiades/chat")>()),
  createChat: vi.fn(() => ({ start: vi.fn(), stop: vi.fn(), send: vi.fn() })),
}));
const notify = vi.hoisted(() => vi.fn(async () => ({ sent: 1, total: 1 })));
vi.mock("../notifier", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../notifier")>()),
  notifierFor: vi.fn(() => ({ notify })),
}));

import { MESSAGE_INTENTS, createChat, type ChatOptions } from "@pleiades/chat";
import { Route } from "@pleiades/notify";
import { decideAutoAdjust } from "../auto-adjust-callback";
import {
  INBOUND_OFF_LOG,
  INBOUND_ON_LOG,
  buttonChannels,
  discordRouter,
  handleDiscordButton,
  messageChannels,
  notifyIntentsFallback,
  startDiscordInteractions,
} from "../discord-interactions";
import { BOT_PROCESS_WITHOUT_TELEGRAM, notifierFor } from "../notifier";

function ctx(action: string) {
  return {
    platform: "discord" as const,
    action,
    userId: "1",
    channelId: "2",
    messageId: "3",
    edit: vi.fn(async () => {}),
    send: vi.fn(async () => ({ id: "m", channelId: "2", edit: async () => {}, setButtons: async () => {}, delete: async () => {} })),
    notice: vi.fn(async () => {}),
    setButtons: vi.fn(async () => {}),
  };
}

describe("handleDiscordButton", () => {
  beforeEach(() => vi.mocked(decideAutoAdjust).mockReset());

  it("수락 — 안내 후 버튼 제거", async () => {
    vi.mocked(decideAutoAdjust).mockResolvedValue({ notice: "✅ 반영", removeKeyboard: true });
    const c = ctx("auto_adjust:accept:adj1");
    await handleDiscordButton(c);
    expect(decideAutoAdjust).toHaveBeenCalledWith("auto_adjust:accept:adj1");
    expect(c.notice).toHaveBeenCalledWith("✅ 반영");
    expect(c.setButtons).toHaveBeenCalledWith([]);
  });

  it("스누즈 — 안내만 · 버튼 유지", async () => {
    vi.mocked(decideAutoAdjust).mockResolvedValue({ notice: "💤 1시간 뒤", removeKeyboard: false });
    const c = ctx("auto_adjust:snooze:adj1");
    await handleDiscordButton(c);
    expect(c.setButtons).not.toHaveBeenCalled();
  });

  it("버튼 제거 실패는 무시(텔레그램과 같이)", async () => {
    vi.mocked(decideAutoAdjust).mockResolvedValue({ notice: "ok", removeKeyboard: true });
    const c = ctx("auto_adjust:reject:adj1");
    c.setButtons.mockRejectedValue(new Error("404"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(handleDiscordButton(c)).resolves.toBeUndefined();
    warn.mockRestore();
  });

  // 회귀: #151 사전 리뷰 info — 결정 뒤 안내가 실패해도 버튼 제거는 계속하고 던지지 않는다
  it("안내 실패에도 버튼 제거는 계속", async () => {
    vi.mocked(decideAutoAdjust).mockResolvedValue({ notice: "✅", removeKeyboard: true });
    const c = ctx("auto_adjust:accept:adj1");
    c.notice.mockRejectedValue(new Error("Unknown interaction"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(handleDiscordButton(c)).resolves.toBeUndefined();
    expect(c.setButtons).toHaveBeenCalledWith([]);
    warn.mockRestore();
  });

  it("다른 접두사는 판단하지 않고 안내만", async () => {
    const c = ctx("vest:confirm:r1");
    await handleDiscordButton(c);
    expect(decideAutoAdjust).not.toHaveBeenCalled();
    expect(c.notice).toHaveBeenCalledWith("알 수 없는 요청입니다.");
  });

  it("라우터는 모든 버튼을 핸들러로 보낸다 — 알 수 없는 접두사도 처리됨(chat 의 실패 안내가 나가지 않는다)", async () => {
    const c = ctx("vest:confirm:r1");
    await expect(discordRouter.handleButton(c)).resolves.toBe(true);
    expect(c.notice).toHaveBeenCalledWith("알 수 없는 요청입니다.");
  });
});

describe("startDiscordInteractions", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("토큰·채널이 없으면 시작하지 않는다", () => {
    vi.stubEnv("DISCORD_BOT_TOKEN_FITNESS", "");
    vi.stubEnv("DISCORD_CHANNEL_ID_FITNESS", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(startDiscordInteractions(BOT_PROCESS_WITHOUT_TELEGRAM)).toBeUndefined();
    log.mockRestore();
  });
});

// pleiades 009 D-2 PR-3 (pleiades#367 · 설계 K · F · T): 대화 채널 키가 메시지 수신 스위치 · 4014 강등 알림
describe("대화 채널 스위치(Kb1 · Ka3)", () => {
  const NOTIFY_CH = "223456789012345678";
  const CHAT_CH = "423456789012345678";
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("DISCORD_BOT_TOKEN_FITNESS", "token-xxxxxxxxxxxxxxxxxxxx");
    vi.stubEnv("DISCORD_CHANNEL_ID_FITNESS", NOTIFY_CH);
    vi.stubEnv("DISCORD_ALLOWED_USER_IDS", "323456789012345678");
    vi.mocked(createChat).mockClear();
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    log.mockRestore();
  });

  const started = (): ChatOptions => {
    expect(startDiscordInteractions(BOT_PROCESS_WITHOUT_TELEGRAM)).toBeDefined();
    return vi.mocked(createChat).mock.calls.at(-1)![0];
  };

  it("비어 있음 → intents 0 · 강등 없음 · 꺼짐 로그 · 메시지 채널 0 · 버튼 = 알림 채널(D-1 과 같다)", () => {
    vi.stubEnv("DISCORD_CHANNEL_ID_FITNESS_CHAT", "");
    const o = started();
    expect(o.intents).toBe(0);
    expect(o.fallbackIntents).toBeUndefined();
    expect(o.onIntentsFallback).toBeUndefined();
    expect(o.messageChannelIds!()).toEqual([]);
    expect(o.allowedChannelIds()).toEqual([NOTIFY_CH]);
    expect(log).toHaveBeenCalledWith(INBOUND_OFF_LOG);
    expect(INBOUND_OFF_LOG).toBe("[discord-fit] 메시지 수신 꺼짐(버튼만)");
  });

  it("형식 불일치 → 꺼짐과 같다", () => {
    vi.stubEnv("DISCORD_CHANNEL_ID_FITNESS_CHAT", "#fitness-chat");
    const o = started();
    expect(o.intents).toBe(0);
    expect(o.messageChannelIds!()).toEqual([]);
    expect(log).toHaveBeenCalledWith(INBOUND_OFF_LOG);
  });

  it("채움 → MESSAGE_INTENTS · fallback 0 · 켜짐 로그 · 메시지 = [대화] · 버튼 = [알림, 대화] · 사진 정책", () => {
    vi.stubEnv("DISCORD_CHANNEL_ID_FITNESS_CHAT", CHAT_CH);
    const o = started();
    expect(o.intents).toBe(MESSAGE_INTENTS);
    expect(o.fallbackIntents).toBe(0);
    expect(typeof o.onIntentsFallback).toBe("function");
    expect(o.messageChannelIds!()).toEqual([CHAT_CH]);
    expect(o.allowedChannelIds()).toEqual([NOTIFY_CH, CHAT_CH]);
    expect(o.attachmentPolicy).toEqual({ maxBytes: 8 * 1024 * 1024, allowedTypes: ["image/jpeg", "image/png", "image/webp"] });
    expect(log).toHaveBeenCalledWith(INBOUND_ON_LOG);
    expect(INBOUND_ON_LOG).toBe("[discord-fit] 메시지 수신 켜짐(대화 채널)");
  });

  it("대화 채널 = 알림 채널 → 버튼 채널 중복 제거 · 메시지 = 그 채널", () => {
    vi.stubEnv("DISCORD_CHANNEL_ID_FITNESS_CHAT", NOTIFY_CH);
    const o = started();
    expect(o.messageChannelIds!()).toEqual([NOTIFY_CH]);
    expect(o.allowedChannelIds()).toEqual([NOTIFY_CH]);
  });

  it("실행 중 키를 비우면 다음 메시지부터 메시지 채널 0(재시작 없음) · 버튼은 알림 채널 유지", () => {
    vi.stubEnv("DISCORD_CHANNEL_ID_FITNESS_CHAT", CHAT_CH);
    const o = started();
    expect(o.messageChannelIds!()).toEqual([CHAT_CH]);
    vi.stubEnv("DISCORD_CHANNEL_ID_FITNESS_CHAT", "");
    expect(o.messageChannelIds!()).toEqual([]);
    expect(o.allowedChannelIds()).toEqual([NOTIFY_CH]);
    expect(messageChannels()).toEqual([]);
    expect(buttonChannels()).toEqual([NOTIFY_CH]);
  });

  it("강등 콜백 → notifyBot 으로 Route.ALLOWED 1회", async () => {
    vi.stubEnv("DISCORD_CHANNEL_ID_FITNESS_CHAT", CHAT_CH);
    notify.mockClear();
    vi.mocked(notifierFor).mockClear();
    const bot = { api: undefined };
    expect(startDiscordInteractions(bot)).toBeDefined();
    const o = vi.mocked(createChat).mock.calls.at(-1)![0];
    await o.onIntentsFallback!();
    expect(notifierFor).toHaveBeenCalledWith(bot);
    expect(notify).toHaveBeenCalledTimes(1);
    expect((notify.mock.calls[0] as unknown[])[0]).toBe(Route.ALLOWED);
  });
});

describe("notifyIntentsFallback(F1)", () => {
  it("sent=0 이면 경고 줄 — gateway 종료 코드 문자열을 쓰지 않는다", async () => {
    notify.mockResolvedValueOnce({ sent: 0, total: 0 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await notifyIntentsFallback(BOT_PROCESS_WITHOUT_TELEGRAM);
    expect(warn).toHaveBeenCalledWith("[discord-fit] 4014 강등 알림 미전송 (sent=0/total=0)");
    expect(String(warn.mock.calls[0][0])).not.toContain("gateway 종료 코드");
    warn.mockRestore();
  });

  it("보냈으면 경고 없음", async () => {
    notify.mockResolvedValueOnce({ sent: 1, total: 1 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await notifyIntentsFallback(BOT_PROCESS_WITHOUT_TELEGRAM);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
