/**
 * #255 — Claude 모델 단일 출처.
 *
 * CLI 에 별칭(`sonnet` · `haiku`)을 넘기면 CLI 버전이 바뀔 때 다른 모델로 조용히
 * 넘어간다 (2026-10-23 CLI 자동 업데이트로 브리핑 품질 후퇴 — #247). 그래서 호출부는
 * 등급(tier)만 고르고, 실제 모델 ID 는 여기서만 정한다.
 *
 * 고정 ID 를 바꾸는 것(버전 업 · 등급 승격)은 `docs/runbooks/ai-model-upgrade.md`
 * 절차 — 대표 질의 비교 결과를 PR 에 붙이고 사용자 판정 뒤에만.
 */

export type ModelTier = 'haiku' | 'sonnet'

/** 등급 → 고정 모델 ID. CLI 2.1.273 시절 별칭이 가리키던 모델 (#255 사용자 결정 A) */
export const PINNED_MODELS: Readonly<Record<ModelTier, string>> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-5',
}

export function resolveModelId(tier: ModelTier): string {
  return PINNED_MODELS[tier]
}

/**
 * CLI 자식 프로세스 env — `--model` 로는 고정되지 않는 CLI 내부 보조 호출
 * (WebSearch 요약 등)도 별칭 해석을 고정 ID 로 덮는다. 부모 env 의 같은 키보다 우선.
 */
export function pinnedModelEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...base,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: PINNED_MODELS.haiku,
    ANTHROPIC_DEFAULT_SONNET_MODEL: PINNED_MODELS.sonnet,
    // 구 이름의 보조 모델 키 — 부모 env 에 남아 있으면 보조 모델이 고정 목록 밖으로 나간다
    ANTHROPIC_SMALL_FAST_MODEL: PINNED_MODELS.haiku,
  }
}

export interface ModelDrift {
  /** result 이벤트 `modelUsage` 의 모델 ID 들 */
  used: string[]
  /** 고정 목록에 없는 모델 ID — 보조 모델 드리프트 포함 */
  unexpected: string[]
  /** 요청한 모델이 `modelUsage` 에 없음 */
  missingExpected: boolean
  drift: boolean
}

/**
 * Pure — CLI result 이벤트의 `modelUsage` 로 실제 쓴 모델이 고정값과 같은지 판정.
 * `modelUsage` 가 없거나 비어 있으면 판정 불가 → null.
 */
export function detectModelDrift(modelUsage: unknown, expectedId: string): ModelDrift | null {
  if (!modelUsage || typeof modelUsage !== 'object' || Array.isArray(modelUsage)) return null
  const used = Object.keys(modelUsage)
  if (used.length === 0) return null
  const pinned = new Set<string>(Object.values(PINNED_MODELS))
  const unexpected = used.filter((id) => !pinned.has(id))
  const missingExpected = !used.includes(expectedId)
  return { used, unexpected, missingExpected, drift: missingExpected || unexpected.length > 0 }
}

/**
 * 드리프트면 경고 문구, 아니면 null. 성공·실패 경로 모두에서 부른다 — 모델 교체는
 * 도구 미호출·is_error 같은 실패로 먼저 드러나기 쉽다 (#255 사전 리뷰 major).
 */
export function modelDriftWarning(caller: string, modelUsage: unknown, expectedId: string): string | null {
  const drift = detectModelDrift(modelUsage, expectedId)
  if (!drift?.drift) return null
  return (
    `[advisor] 모델 드리프트 caller=${caller} expected=${expectedId} ` +
    `used=${drift.used.join(',')} unexpected=${drift.unexpected.join(',') || '-'}`
  )
}
