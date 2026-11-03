import { toDiscordComponents } from "@pleiades/notify";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

import { buildAutoAdjustKeyboard } from "../auto-adjust";

// 회귀: 009 D-5 A4 — grammY 를 떼어도 Discord 페이로드는 옛 InlineKeyboard 때와 같다(옛 메시지 클릭도 그대로)
describe("buildAutoAdjustKeyboard", () => {
  it("custom_id 와 라벨이 그대로다", () => {
    expect(toDiscordComponents(buildAutoAdjustKeyboard("a1"))).toEqual([
      {
        type: 1,
        components: [
          { type: 2, style: 2, label: "✅ Accept", custom_id: "auto_adjust:accept:a1" },
          { type: 2, style: 2, label: "❌ Reject", custom_id: "auto_adjust:reject:a1" },
          { type: 2, style: 2, label: "💤 Snooze 1h", custom_id: "auto_adjust:snooze:a1" },
        ],
      },
    ]);
  });
});
