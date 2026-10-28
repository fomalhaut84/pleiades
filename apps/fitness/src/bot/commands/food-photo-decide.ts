// pleiades 009 D-2 PR-3 (pleiades#367 · PR-2 사전 리뷰 info 2): 사진 판단만 — 텔레그램 모듈 그래프(grammy 다운로드 ·
// https Agent · bot/index.ts)를 끌고 오지 않게 food-photo.ts 에서 떼었다. 텔레그램 어댑터(food-photo.ts)와
// Discord 첨부 경로(discord/photo.ts)가 같은 판단을 쓴다. 본문은 옮기기만 했다(동작 무변경).

import prisma from "../prisma";
import { withHistoryCacheBump } from "../../lib/history/cache";
import type { Prisma } from "@/generated/prisma/client";
import { recalculateCalorieBalance } from "@/lib/fitness/calorie-balance";
import { markStaleRecalcDate } from "@/lib/nutrition/stale-recalc";
import { estimateNutritionFromPhoto } from "@/lib/nutrition/estimate-nutrition-photo";
import { foodLogButtons } from "./food-edit-callback";
import { MEAL_LABELS, MEAL_PATTERNS, CONFIDENCE_LABEL } from "./food";
import { plainReply, type BotReply } from "../core/reply";

/** KST 시간대별 mealType 추정. 사용자가 캡션으로 명시하지 않은 경우 fallback. */
function guessMealTypeByKstTime(now: Date = new Date()): string {
  const kstHour = Number(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false }),
  );
  if (kstHour >= 5 && kstHour < 11) return "breakfast";
  if (kstHour >= 11 && kstHour < 15) return "lunch";
  if (kstHour >= 15 && kstHour < 18) return "snack";
  if (kstHour >= 18 && kstHour < 22) return "dinner";
  return "snack";
}

function extractMealFromCaption(caption?: string): { mealType: string; residual: string } | null {
  if (!caption) return null;
  const trimmed = caption.trim();
  const meal = MEAL_PATTERNS.find((m) => m.pattern.test(trimmed));
  if (!meal) return null;
  const residual = trimmed.replace(meal.pattern, "").trim();
  return { mealType: meal.type, residual };
}

/**
 * 다운로드된 음식 사진 1장 → Vision → FoodLog 저장 → 응답 모델(판단 · pleiades#364).
 * `caption` 은 사진 설명 원문(식사 접두 `점심 …` 이면 mealType) · `sentAt` 은 메시지 시각(끼니 추정 · 저장 날짜 기준).
 * 길이 절단은 하지 않는다 — 텔레그램 4096 은 어댑터 · Discord 2000 분할은 chat 이 한다(설계 C 표).
 */
export async function decidePhotoFood(input: {
  imagePath: string;
  caption?: string;
  sentAt: Date;
}): Promise<BotReply> {
  const photoTimestamp = input.sentAt;
  // 캡션 파싱 → mealType + 잔여 description.
  // Codex P2 (PR #310 5회차): 무캡션 mealType 추정도 photoTimestamp 기준. handler 진입 시점 (now)
  // 을 쓰면 KST 식사 boundary (10:59 → 11:00 등) 근처 재처리 시 timestamp 와 mealType 불일치 →
  // repeat-lookup / backfill mealType 매칭 어긋남.
  const rawCaption = input.caption?.trim();
  const parsed = extractMealFromCaption(rawCaption);
  const mealType = parsed?.mealType ?? guessMealTypeByKstTime(photoTimestamp);
  const caption = (parsed?.residual ?? rawCaption)?.trim() || undefined;

  const estimate = await estimateNutritionFromPhoto({
    imagePath: input.imagePath,
    caption,
    mealType,
  });

  // Codex P2 (PR #310): Vision 실패 + caption 없음 → FoodLog 저장 안 함 (kcal null +
  // meaningless description "사진 (분석 실패)" 이 backfill 큐에 들어가 매 tick 텍스트
  // estimator 로 무한 재시도). 사용자에게 재시도/텍스트 입력 안내만.
  if (!estimate && !caption) {
    return plainReply(
      "⚠️ Vision 분석 실패 — 사진을 다시 보내거나, 텍스트 (예: 아침 김치찌개 밥) 로 입력해주세요.",
    );
  }

  // description 결정: caption 우선 → Vision items 요약 → fallback.
  const description = caption
    ? caption
    : estimate?.items && estimate.items.length > 0
      ? estimate.items.map((i) => i.name).join(" · ")
      : "사진 (분석 실패)";

  const log = await prisma.foodLog.create({
    data: {
      date: photoTimestamp,
      description,
      mealType,
      estimatedKcal: estimate?.kcal ?? null,
      proteinG: estimate?.proteinG ?? null,
      carbsG: estimate?.carbsG ?? null,
      fatG: estimate?.fatG ?? null,
      // #322: Vision estimator items 저장 (사진 → 항목별 분해).
      items: (estimate?.items ?? undefined) as Prisma.InputJsonValue | undefined,
    },
    select: { id: true },
  });

  // 칼로리 밸런스 재계산. 실패 시 stale queue mark (기존 food.ts recalcWithRetry 로직 축약).
  // #403 (사전 리뷰 major 2): bump 는 재계산 **뒤** — 재계산 전 값이 새 키로 캐시되지 않게
  await withHistoryCacheBump(async () => {
    try {
      await recalculateCalorieBalance(photoTimestamp, undefined, prisma);
    } catch (err) {
      console.warn(
        `[food-photo] recalc 실패, stale queue 등록: ${err instanceof Error ? err.message : String(err)}`,
      );
      try {
        await markStaleRecalcDate(photoTimestamp);
      } catch {
        // ignore
      }
    }
  });

  // 응답 조립.
  const mealLabel = MEAL_LABELS[mealType] ?? mealType;
  const lines: string[] = [`✅ ${mealLabel} 기록 완료`, `📝 ${description}`];
  if (estimate) {
    lines.push(
      `📊 약 ${estimate.kcal.toLocaleString("ko-KR")} kcal (신뢰도 ${CONFIDENCE_LABEL[estimate.confidence]})`,
    );
    const p = estimate.proteinG;
    const c = estimate.carbsG;
    const f = estimate.fatG;
    if (p !== null && c !== null && f !== null) {
      lines.push(`🥩 P ${Math.round(p)}g · C ${Math.round(c)}g · F ${Math.round(f)}g`);
    }
    if (estimate.notes) lines.push(`ℹ️ ${estimate.notes}`);
  } else {
    lines.push("⚠️ Vision 분석 실패 — [🔢 kcal] 로 직접 입력하거나 [🗑️ 삭제] 후 다시 시도");
  }

  return plainReply(lines.join("\n"), { buttons: foodLogButtons(log.id) });
}
