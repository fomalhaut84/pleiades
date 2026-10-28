import { afterEach, describe, expect, it } from "vitest";
import { discordStateKey, telegramStateKey, telegramStateKeyOf } from "../state-key";
import {
  clearPendingEditFor,
  deletePendingEdit,
  markPendingEdit,
  peekPendingEdit,
  shouldConsumeAsEditInput,
} from "../../commands/food-edit-state";

// pleiades 009 D-2 PR-2 (pleiades#364 · 설계 S): 편집 대기 키 문자열화 · 플랫폼 교차 격리

describe("상태 키", () => {
  it("형식", () => {
    expect(telegramStateKey(1001)).toBe("telegram:1001");
    expect(discordStateKey("2002", "9")).toBe("discord:2002:9");
  });

  it("텔레그램 chat 에서 — 숫자가 아니면 undefined(옛 가드)", () => {
    expect(telegramStateKeyOf({ id: -100123 })).toBe("telegram:-100123");
    expect(telegramStateKeyOf(undefined)).toBeUndefined();
    expect(telegramStateKeyOf({})).toBeUndefined();
    expect(telegramStateKeyOf({ id: "42" })).toBeUndefined();
  });
});

describe("편집 대기 — 플랫폼 교차 격리", () => {
  const tg = telegramStateKey(77);
  const dc = discordStateKey("77", "77");
  const dcOther = discordStateKey("77", "88");
  afterEach(() => [tg, dc, dcOther].forEach(deletePendingEdit));

  it("같은 숫자의 텔레그램·Discord 키는 서로를 소비하지 않는다", () => {
    markPendingEdit(tg, "log-tg", "kcal");
    expect(shouldConsumeAsEditInput(dc, "650")).toBe(false);
    markPendingEdit(dc, "log-dc", "desc");
    expect(peekPendingEdit(tg)).toEqual({ logId: "log-tg", action: "kcal" });
    expect(peekPendingEdit(dc)).toEqual({ logId: "log-dc", action: "desc" });
    expect(clearPendingEditFor(dc, "log-tg")).toBe(false);
    expect(peekPendingEdit(tg)?.logId).toBe("log-tg");
  });

  // PR-2 사전 리뷰 info 1 — logId 가 같아야 진짜 교차 검사다
  it("같은 logId 라도 한쪽 취소가 다른 쪽 대기를 지우지 않는다", () => {
    markPendingEdit(tg, "same", "kcal");
    markPendingEdit(dc, "same", "desc");
    expect(clearPendingEditFor(dc, "same")).toBe(true);
    expect(peekPendingEdit(tg)).toEqual({ logId: "same", action: "kcal" });
  });

  it("Discord 는 같은 채널이라도 사용자별", () => {
    markPendingEdit(dc, "log-dc", "kcal");
    expect(shouldConsumeAsEditInput(dcOther, "650")).toBe(false);
    expect(shouldConsumeAsEditInput(dc, "650")).toBe(true);
  });
});
