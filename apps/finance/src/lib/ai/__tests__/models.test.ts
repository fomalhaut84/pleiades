/**
 * 회귀: #255 — CLI 자동 업데이트(2026-10-23)로 `--model sonnet` 별칭이 다른 모델을
 * 가리켜 브리핑 품질이 후퇴했다 (#247). 등급 → 고정 ID · 보조 모델 env · 드리프트 판정.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectModelDrift, PINNED_MODELS, pinnedModelEnv, resolveModelId } from '../models'

describe('resolveModelId', () => {
  it('등급을 별칭이 아닌 정식 모델 ID 로 바꾼다', () => {
    expect(resolveModelId('sonnet')).toBe(PINNED_MODELS.sonnet)
    expect(resolveModelId('haiku')).toBe(PINNED_MODELS.haiku)
    for (const id of Object.values(PINNED_MODELS)) {
      expect(id).toMatch(/^claude-/)
      expect(['sonnet', 'haiku', 'opus']).not.toContain(id)
    }
  })
})

describe('pinnedModelEnv', () => {
  it('CLI 보조 모델 별칭을 고정 ID 로 덮고 부모 env 는 유지한다', () => {
    const env = pinnedModelEnv({ PATH: '/bin', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'other' } as unknown as NodeJS.ProcessEnv)
    expect(env.PATH).toBe('/bin')
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe(PINNED_MODELS.haiku)
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe(PINNED_MODELS.sonnet)
  })
})

describe('detectModelDrift', () => {
  it('고정 모델만 쓰면 드리프트 없음 (보조 haiku 포함)', () => {
    const d = detectModelDrift({ [PINNED_MODELS.sonnet]: {}, [PINNED_MODELS.haiku]: {} }, PINNED_MODELS.sonnet)
    expect(d?.drift).toBe(false)
    expect(d?.used).toEqual([PINNED_MODELS.sonnet, PINNED_MODELS.haiku])
  })

  it('요청 모델 대신 다른 모델이 쓰이면 드리프트', () => {
    const d = detectModelDrift({ 'claude-sonnet-9': {} }, PINNED_MODELS.sonnet)
    expect(d).toMatchObject({ drift: true, missingExpected: true, unexpected: ['claude-sonnet-9'] })
  })

  it('보조 모델만 바뀌어도 드리프트', () => {
    const d = detectModelDrift({ [PINNED_MODELS.sonnet]: {}, 'claude-haiku-9': {} }, PINNED_MODELS.sonnet)
    expect(d).toMatchObject({ drift: true, missingExpected: false, unexpected: ['claude-haiku-9'] })
  })

  it('modelUsage 가 없거나 비면 판정 불가 (null)', () => {
    expect(detectModelDrift(undefined, PINNED_MODELS.sonnet)).toBeNull()
    expect(detectModelDrift({}, PINNED_MODELS.sonnet)).toBeNull()
    expect(detectModelDrift([], PINNED_MODELS.sonnet)).toBeNull()
  })
})

describe('claude-advisor 가 고정 ID 를 쓴다 (소스 검사)', () => {
  const src = readFileSync(path.resolve(__dirname, '../claude-advisor.ts'), 'utf8')

  it("--model 에 별칭 등급이 아니라 resolveModelId 결과를 넘긴다", () => {
    expect(src).toMatch(/'--model',\s*modelId\b/)
    expect(src).toMatch(/const modelId = resolveModelId\(model\)/)
  })

  it('CLI 자식 프로세스 env 에 pinnedModelEnv 를 쓴다', () => {
    expect(src).toMatch(/env:\s*pinnedModelEnv\(\)/)
  })
})
