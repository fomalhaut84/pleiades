import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Bot } from "grammy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  filePollingStateStore,
  isUnauthorized,
  pollingDisabled,
  startTelegramPolling,
  type PollingState,
  type PollingStateStore,
} from "../telegram-polling";

// pleiades 009 D-1 (pleiades#347) — 텔레그램은 곁가지: 토큰 없음·폴링 끔·실패가 프로세스를 끝내지 않는다(1-2 · 1-4 · 1-9) ·
// 직전에 꺼져 있었으면 밀린 업데이트를 버린다(1-5).

type StartOpts = { drop_pending_updates?: boolean; onStart?: (info: { username: string }) => void };

function fakeBot(behavior: (opts: StartOpts) => Promise<void>) {
  let running = false;
  const bot = {
    catch: vi.fn(),
    start: vi.fn(async (opts: StartOpts) => {
      running = true;
      try {
        await behavior(opts);
      } finally {
        running = false;
      }
    }),
    stop: vi.fn(async () => {
      running = false;
    }),
    isRunning: () => running,
  };
  return bot;
}

function memoryStore(initial?: PollingState): PollingStateStore & { writes: PollingState[] } {
  let v = initial;
  const writes: PollingState[] = [];
  return {
    writes,
    read: () => v,
    write: (s) => {
      v = s;
      writes.push(s);
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** onStart 를 부른 뒤 stop 될 때까지 기다리는 폴링 */
const pollsUntilStopped = (bot: () => { isRunning(): boolean }) => async (opts: StartOpts) => {
  opts.onStart?.({ username: "verify_bot" });
  while (bot().isRunning()) await new Promise((r) => setTimeout(r, 1));
};

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("startTelegramPolling — 시작하지 않는 경우", () => {
  it("토큰 없음 → 폴링하지 않고 상태를 off 로 남긴다", async () => {
    const state = memoryStore("on");
    const t = startTelegramPolling({ createBot: undefined, state, disabled: false });
    expect(t.current()).toBeUndefined();
    expect(state.writes).toEqual(["off"]);
    await expect(t.stop()).resolves.toBeUndefined();
  });

  it("TELEGRAM_POLLING=off → 봇을 만들지 않는다 · 판정 로그 1줄", () => {
    const createBot = vi.fn();
    const state = memoryStore("on");
    startTelegramPolling({ createBot, state, disabled: true });
    expect(createBot).not.toHaveBeenCalled();
    expect(state.writes).toEqual(["off"]);
    expect(vi.mocked(console.log)).toHaveBeenCalledWith("[bot] 텔레그램 폴링 꺼짐(TELEGRAM_POLLING=off)");
  });
});

describe("startTelegramPolling — 밀린 업데이트 (1-5)", () => {
  it.each([
    ["off", true],
    [undefined, true],
    ["on", false],
  ] as const)("직전 상태 %s → drop_pending_updates %s · 시작하면 on 을 남긴다", async (prev, drop) => {
    const state = memoryStore(prev);
    let b!: ReturnType<typeof fakeBot>;
    b = fakeBot(pollsUntilStopped(() => b));
    const t = startTelegramPolling({ createBot: () => b as unknown as Bot, state, disabled: false });
    await flush();
    expect(b.start.mock.calls[0][0].drop_pending_updates).toBe(drop);
    expect(state.writes).toEqual(["on"]);
    await t.stop();
    expect(b.stop).toHaveBeenCalledTimes(1);
  });
});

describe("startTelegramPolling — 실패해도 끝내지 않는다 (1-9)", () => {
  it("401 → 다시 하지 않고 onFatal 1회 · process.exit 없음", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const onFatal = vi.fn();
    const createBot = vi.fn(() =>
      fakeBot(async () => {
        throw Object.assign(new Error("Unauthorized"), { error_code: 401 });
      }) as unknown as Bot,
    );
    const state = memoryStore("on");
    const t = startTelegramPolling({ createBot, state, disabled: false, onFatal, sleep: async () => {} });
    await flush();
    expect(createBot).toHaveBeenCalledTimes(1);
    // 회귀: PR-2 사전 리뷰 major 1 — 401 로 멈추면 상태를 off 로 남겨 토큰 교체 뒤 밀린 명령을 버린다(1-5)
    expect(state.writes).toEqual(["off"]);
    expect(onFatal).toHaveBeenCalledWith("텔레그램 토큰 무효(401)");
    expect(t.current()).toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
  });

  it("409·네트워크 → 간격을 두고 새 인스턴스로 다시 · 시작 전 실패면 drop 유지", async () => {
    const waits: number[] = [];
    let n = 0;
    let last!: ReturnType<typeof fakeBot>;
    const createBot = vi.fn(() => {
      n += 1;
      last =
        n < 3
          ? fakeBot(async () => {
              throw Object.assign(new Error("Conflict"), { error_code: 409 });
            })
          : fakeBot(pollsUntilStopped(() => last));
      return last as unknown as Bot;
    });
    const state = memoryStore("off");
    const t = startTelegramPolling({
      createBot,
      state,
      disabled: false,
      retryDelaysMs: [10, 20],
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    await flush();
    expect(createBot).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([10, 20]);
    expect(last.start.mock.calls[0][0].drop_pending_updates).toBe(true);
    expect(state.writes).toEqual(["on"]);
    await t.stop();
  });

  it("onFatal 이 던져도 루프 밖으로 새지 않는다", async () => {
    const createBot = () =>
      fakeBot(async () => {
        throw Object.assign(new Error("Unauthorized"), { error_code: 401 });
      }) as unknown as Bot;
    startTelegramPolling({
      createBot,
      state: memoryStore(),
      disabled: false,
      onFatal: async () => {
        throw new Error("webhook down");
      },
    });
    await flush();
    expect(vi.mocked(console.error).mock.calls.some((c) => String(c[0]).includes("텔레그램 중지 알림 실패"))).toBe(true);
  });
});

describe("startTelegramPolling — 방어", () => {
  it("createBot 이 던져도 루프가 끝나지 않고 다시 시도한다", async () => {
    let n = 0;
    let last!: ReturnType<typeof fakeBot>;
    const createBot = vi.fn(() => {
      n += 1;
      if (n === 1) throw new Error("boom");
      last = fakeBot(pollsUntilStopped(() => last));
      return last as unknown as Bot;
    });
    const t = startTelegramPolling({ createBot, state: memoryStore("on"), disabled: false, sleep: async () => {} });
    await flush();
    expect(createBot).toHaveBeenCalledTimes(2);
    await t.stop();
  });

  it("정상 시작 뒤 실패는 첫 간격부터 · 이어지는 실패는 다음 간격", async () => {
    const waits: number[] = [];
    let n = 0;
    let last!: ReturnType<typeof fakeBot>;
    const createBot = vi.fn(() => {
      n += 1;
      last =
        n === 1
          ? fakeBot(async (o) => {
              o.onStart?.({ username: "verify_bot" });
              throw Object.assign(new Error("Conflict"), { error_code: 409 });
            })
          : n === 2
            ? fakeBot(async () => {
                throw Object.assign(new Error("Conflict"), { error_code: 409 });
              })
            : fakeBot(pollsUntilStopped(() => last));
      return last as unknown as Bot;
    });
    const t = startTelegramPolling({
      createBot,
      state: memoryStore("on"),
      disabled: false,
      retryDelaysMs: [10, 20, 30],
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    await flush();
    expect(waits).toEqual([10, 20]);
    await t.stop();
  });
});

describe("pollingDisabled · isUnauthorized", () => {
  it.each([
    ["off", true],
    [" OFF ", true],
    ["on", false],
    ["false", false],
    ["", false],
    [undefined, false],
  ])("TELEGRAM_POLLING=%s → %s", (v, want) => {
    expect(pollingDisabled(v === undefined ? {} : { TELEGRAM_POLLING: v })).toBe(want);
  });

  it("401 만 무효로 본다", () => {
    expect(isUnauthorized({ error_code: 401 })).toBe(true);
    expect(isUnauthorized({ error_code: 409 })).toBe(false);
    expect(isUnauthorized(new Error("x"))).toBe(false);
    expect(isUnauthorized(null)).toBe(false);
  });
});

describe("filePollingStateStore", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "fit-polling-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("없으면 undefined · 쓰면 읽힌다 · 파일 600", () => {
    const file = path.join(dir, "logs", "telegram-polling-fit.json");
    const store = filePollingStateStore(file);
    expect(store.read()).toBeUndefined();
    store.write("off");
    expect(store.read()).toBe("off");
    store.write("on");
    expect(store.read()).toBe("on");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it("깨진 파일은 undefined(버리는 쪽)", () => {
    const file = path.join(dir, "s.json");
    fs.writeFileSync(file, "{not json");
    expect(filePollingStateStore(file).read()).toBeUndefined();
    fs.writeFileSync(file, JSON.stringify({ polling: "maybe" }));
    expect(filePollingStateStore(file).read()).toBeUndefined();
  });
});
