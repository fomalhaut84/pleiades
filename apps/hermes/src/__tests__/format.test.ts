// 014 §3-E — Discord 로 나가는 모양(H-1b · #794)
import { describe, expect, it } from "vitest";
import { POST_MAX } from "../checks";
import { blockedNotice, formatMessage, HERMES_USERNAME } from "../format";
import type { QueuedMessage } from "../queue";
import type { Source } from "../registry";

const SRC: Source = {
  id: "orders",
  name: "주문",
  keySha256: "0".repeat(64),
  enabled: true,
  expires: null,
  linkHosts: ["shop.example.com"],
  ratePerMinute: 30,
};
const m = (over: Partial<QueuedMessage> = {}): QueuedMessage => ({
  id: "1",
  source: "orders",
  text: "주문 #1",
  level: "info",
  attempts: 0,
  receivedAt: 0,
  ...over,
});

describe("formatMessage", () => {
  it("평문 escape · 굵은 제목 · username spot·이름", () => {
    expect(formatMessage(m({ title: "새 *주문*", text: "# 제목 아님\n- 목록 아님 · **굵게 아님**" }), SRC)).toEqual({
      content: "**새 \\*주문\\***\n\\# 제목 아님\n\\- 목록 아님 · \\*\\*굵게 아님\\*\\*",
      username: "spot·주문",
      linkDropped: false,
    });
  });

  it("warn 은 앞에 ⚠️", () => {
    expect(formatMessage(m({ level: "warn", title: "재고" }), SRC).content).toBe("⚠️ **재고**\n주문 #1");
    expect(formatMessage(m({ level: "warn" }), SRC).content).toBe("⚠️ 주문 #1");
  });

  it("링크 — 허용 호스트면 주소가 보이는 줄 · 마스크 링크 없음", () => {
    const r = formatMessage(m({ link: { label: "주문 [보기]", url: "https://shop.example.com/o/1?a=b" } }), SRC);
    expect(r.content).toBe("주문 #1\n🔗 주문 \\[보기\\] · https://shop.example.com/o/1?a=b");
    expect(r.linkDropped).toBe(false);
  });

  it("링크 주소의 서식 · 링크 문자는 퍼센트 인코딩 — 가짜 마스크 링크가 되지 않게", () => {
    const r = formatMessage(m({ link: { label: "x", url: "https://shop.example.com/[a](https://evil.example)_*~|`" } }), SRC);
    expect(r.content).toBe("주문 #1\n🔗 x · https://shop.example.com/%5Ba%5D%28https://evil.example%29%5F%2A%7E%7C%60");
  });

  it("허용 밖 호스트 · 허용 목록 없음 · 출처 없음 → 링크 줄을 뺀다", () => {
    const link = { label: "x", url: "https://evil.example.com/" };
    expect(formatMessage(m({ link }), SRC)).toMatchObject({ content: "주문 #1", linkDropped: true });
    expect(formatMessage(m({ link: { label: "x", url: "https://shop.example.com.evil.io/" } }), SRC).linkDropped).toBe(true);
    expect(formatMessage(m({ link: { label: "x", url: "https://shop.example.com/" } }), null)).toMatchObject({
      content: "주문 #1",
      linkDropped: true,
      username: "spot·orders",
    });
  });

  it("2000자를 넘으면 text 를 잘라 … — escape 를 반으로 자르지 않는다", () => {
    const r = formatMessage(m({ title: "t", text: "*".repeat(1500), link: { label: "x", url: "https://shop.example.com/" } }), SRC);
    expect(r.content.length).toBeLessThanOrEqual(POST_MAX);
    expect(r.content).toMatch(/(\\\*)+…\n🔗 x · https:\/\/shop\.example\.com\/$/);
    expect(r.content).not.toMatch(/[^\\]\*…/);
  });
});

describe("blockedNotice", () => {
  it("고정 문구 · 원문 없음 · hermes 이름", () => {
    expect(blockedNotice("orders", "pii")).toEqual({ content: "[hermes] 게시 차단 · orders · 사유 pii", username: HERMES_USERNAME });
  });
});
