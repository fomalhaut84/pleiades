// #255: Claude 모델 단일 출처.
// CLI 에 별칭(`sonnet` · `haiku`)을 넘기면 CLI 버전이 바뀔 때 다른 모델로 조용히 넘어간다
// (2026-10-23 서버 CLI 자동 업데이트 — pleiades#247). 호출부는 등급만 고르고 실제 모델 ID 는 여기서만 정한다.
// 고정 ID 변경(버전 업 · 등급 승격)은 pleiades `docs/runbooks/ai-model-upgrade.md` 절차 — 비교 결과 + 사용자 판정 뒤에만.

export type ClaudeModelTier = "haiku" | "sonnet";

/** 등급 → 고정 모델 ID. CLI 2.1.273 시절 별칭이 가리키던 모델 (#255 사용자 결정 A) */
export const PINNED_CLAUDE_MODELS: Readonly<Record<ClaudeModelTier, string>> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-5",
};

export function claudeModelId(tier: ClaudeModelTier): string {
  return PINNED_CLAUDE_MODELS[tier];
}

/**
 * CLI 자식 프로세스 env — `--model` 로는 고정되지 않는 CLI 내부 보조 호출의 별칭 해석도 고정 ID 로 덮는다.
 * 부모 env 의 같은 키보다 우선.
 */
export function claudeSpawnEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...base,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: PINNED_CLAUDE_MODELS.haiku,
    ANTHROPIC_DEFAULT_SONNET_MODEL: PINNED_CLAUDE_MODELS.sonnet,
  };
}

export interface ModelDrift {
  /** result 의 `modelUsage` 모델 ID 들 */
  used: string[];
  /** 고정 목록에 없는 모델 ID — 보조 모델 드리프트 포함 */
  unexpected: string[];
  /** 요청한 모델이 `modelUsage` 에 없음 */
  missingExpected: boolean;
  drift: boolean;
}

/** Pure — `modelUsage` 로 실제 쓴 모델이 고정값과 같은지 판정. 없거나 비면 판정 불가 → null. */
export function detectModelDrift(modelUsage: unknown, expectedId: string): ModelDrift | null {
  if (!modelUsage || typeof modelUsage !== "object" || Array.isArray(modelUsage)) return null;
  const used = Object.keys(modelUsage);
  if (used.length === 0) return null;
  const pinned = new Set<string>(Object.values(PINNED_CLAUDE_MODELS));
  const unexpected = used.filter((id) => !pinned.has(id));
  const missingExpected = !used.includes(expectedId);
  return { used, unexpected, missingExpected, drift: missingExpected || unexpected.length > 0 };
}

/** CLI JSON 출력(`--output-format json`)에서 드리프트를 보고 경고만 남긴다 — 동작은 바꾸지 않는다. */
export function warnModelDrift(tag: string, cliOutput: unknown, tier: ClaudeModelTier): void {
  const usage =
    cliOutput && typeof cliOutput === "object" ? (cliOutput as { modelUsage?: unknown }).modelUsage : undefined;
  const expected = claudeModelId(tier);
  const drift = detectModelDrift(usage, expected);
  if (drift?.drift) {
    console.warn(
      `[${tag}] 모델 드리프트 expected=${expected} used=${drift.used.join(",")} unexpected=${drift.unexpected.join(",") || "-"}`,
    );
  }
}
