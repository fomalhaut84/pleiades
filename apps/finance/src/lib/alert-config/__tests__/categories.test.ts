import { describe, expect, it } from 'vitest'
import {
  ALERT_CATEGORIES,
  ALERT_KEY_CATEGORY,
  categoryOf,
  inputTypeOf,
  groupByCategory,
} from '../categories'

describe('categoryOf', () => {
  it('알려진 키는 매핑된 카테고리 반환', () => {
    expect(categoryOf('price_drop_pct')).toBe('price')
    expect(categoryOf('active_review')).toBe('ai')
    expect(categoryOf('budget_warn_pct')).toBe('expense')
    expect(categoryOf('daily_summary_hour')).toBe('schedule')
  })

  it('알려지지 않은 키는 general fallback', () => {
    expect(categoryOf('unknown_key_xyz')).toBe('general')
    expect(categoryOf('')).toBe('general')
  })
})

describe('inputTypeOf', () => {
  it('매핑 있으면 override 우선', () => {
    expect(inputTypeOf('ta_ai_guide', 'off')).toBe('toggle')
    expect(inputTypeOf('price_drop_pct', '-5')).toBe('percent')
    expect(inputTypeOf('daily_summary_hour', '8')).toBe('hour')
  })

  it('매핑 없고 값이 on/off 이면 toggle 자동 판정', () => {
    expect(inputTypeOf('random_key_x', 'on')).toBe('toggle')
    expect(inputTypeOf('random_key_x', 'OFF')).toBe('toggle')
  })

  it('매핑 없고 숫자 값이면 integer', () => {
    expect(inputTypeOf('random_key_y', '123')).toBe('integer')
    expect(inputTypeOf('random_key_y', '-5')).toBe('integer')
    expect(inputTypeOf('random_key_y', '3.14')).toBe('integer')
  })

  it('매핑 없고 비숫자 문자열은 text (URL/토큰 값 보존)', () => {
    // codex P2 회귀 방지 — integer 로 판정하면 <input type="number"> 가 값을 blank 처리
    expect(inputTypeOf('whooing_url', 'https://example.com/webhook')).toBe('text')
    expect(inputTypeOf('some_token', 'abc-def-123')).toBe('text')
    expect(inputTypeOf('random_key', 'hello world')).toBe('text')
    expect(inputTypeOf('empty_key', '')).toBe('text')
    expect(inputTypeOf('space_key', '   ')).toBe('text')
  })
})

describe('groupByCategory', () => {
  const items = [
    { key: 'price_drop_pct', value: '-5' },
    { key: 'active_review', value: 'on' },
    { key: 'custom_strategy_alerts', value: 'on' },
    { key: 'budget_warn_pct', value: '80' },
    { key: 'unknown_key', value: 'x' },
  ]

  it('카테고리별로 묶고 사이드바 순서 유지', () => {
    const groups = groupByCategory(items)
    const keys = groups.map((g) => g.category.key)
    // ALERT_CATEGORIES 순서: price → expense → schedule → ai → general
    expect(keys).toEqual(['price', 'expense', 'ai', 'general'])
  })

  it('각 그룹 내 아이템 정합성', () => {
    const groups = groupByCategory(items)
    const aiGroup = groups.find((g) => g.category.key === 'ai')!
    expect(aiGroup.items.map((i) => i.key).sort()).toEqual(['active_review', 'custom_strategy_alerts'])
  })

  it('빈 카테고리는 결과에서 제외', () => {
    const groups = groupByCategory([{ key: 'active_review', value: 'on' }])
    expect(groups.length).toBe(1)
    expect(groups[0].category.key).toBe('ai')
  })

  it('빈 입력 → 빈 배열', () => {
    expect(groupByCategory([])).toEqual([])
  })
})

describe('ALERT_KEY_CATEGORY 완전성', () => {
  it('실제 사용 중인 10개 키가 모두 매핑됨', () => {
    const knownKeys = [
      'price_drop_pct',
      'price_surge_pct',
      'fx_change_krw',
      'budget_warn_pct',
      'daily_summary_hour',
      'monthly_report_day',
      'ta_check_interval_min',
      'ta_ai_guide',
      'active_review',
      'custom_strategy_alerts',
    ]
    for (const key of knownKeys) {
      expect(ALERT_KEY_CATEGORY[key]).toBeDefined()
    }
  })
})

describe('ALERT_CATEGORIES 정합성', () => {
  it('key 는 유일하며 general 이 포함', () => {
    const catKeys = ALERT_CATEGORIES.map((c) => c.key)
    expect(new Set(catKeys).size).toBe(catKeys.length)
    expect(catKeys).toContain('general')
  })
})
