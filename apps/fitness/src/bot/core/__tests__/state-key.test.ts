import { afterEach, describe, expect, it } from "vitest";
import { discordStateKey } from "../state-key";
import {
  clearPendingEditFor,
  deletePendingEdit,
  markPendingEdit,
  peekPendingEdit,
  shouldConsumeAsEditInput,
} from "../../commands/food-edit-state";

// pleiades 009 D-2 PR-2 (pleiades#364 · 설계 S): 편집 대기 키 문자열화 · 채널·사용자 격리
// (009 D-5 B2 #504: 텔레그램 키를 지워 플랫폼 교차 케이스는 채널 교차로 바꿨다)

describe("상태 키", () => {
  it("형식", () => {
    expect(discordStateKey("2002", "9")).toBe("discord:2002:9");
  });
});

describe("편집 대기 — 채널·사용자 격리", () => {
  const dc = discordStateKey("77", "77");
  const dcOther = discordStateKey("77", "88");
  const otherChannel = discordStateKey("78", "77");
  afterEach(() => [dc, dcOther, otherChannel].forEach(deletePendingEdit));

  it("같은 사용자라도 다른 채널의 키는 서로를 소비하지 않는다", () => {
    markPendingEdit(otherChannel, "log-a", "kcal");
    expect(shouldConsumeAsEditInput(dc, "650")).toBe(false);
    markPendingEdit(dc, "log-dc", "desc");
    expect(peekPendingEdit(otherChannel)).toEqual({ logId: "log-a", action: "kcal" });
    expect(peekPendingEdit(dc)).toEqual({ logId: "log-dc", action: "desc" });
    expect(clearPendingEditFor(dc, "log-a")).toBe(false);
    expect(peekPendingEdit(otherChannel)?.logId).toBe("log-a");
  });

  // PR-2 사전 리뷰 info 1 — logId 가 같아야 진짜 교차 검사다
  it("같은 logId 라도 한쪽 취소가 다른 쪽 대기를 지우지 않는다", () => {
    markPendingEdit(otherChannel, "same", "kcal");
    markPendingEdit(dc, "same", "desc");
    expect(clearPendingEditFor(dc, "same")).toBe(true);
    expect(peekPendingEdit(otherChannel)).toEqual({ logId: "same", action: "kcal" });
  });

  it("같은 채널이라도 사용자별", () => {
    markPendingEdit(dc, "log-dc", "kcal");
    expect(shouldConsumeAsEditInput(dcOther, "650")).toBe(false);
    expect(shouldConsumeAsEditInput(dc, "650")).toBe(true);
  });
});
