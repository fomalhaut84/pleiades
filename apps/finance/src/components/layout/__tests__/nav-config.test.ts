import { describe, expect, it } from 'vitest'
import {
  NAV_GROUPS,
  MOBILE_FIXED_HREFS,
  deriveMobileMoreItems,
  isPathActive,
  findActiveGroup,
  type NavGroup,
} from '../nav-config'

describe('deriveMobileMoreItems (실제 NAV_GROUPS)', () => {
  const items = deriveMobileMoreItems()

  it('MOBILE_FIXED_HREFS 항목은 제외 (/, /trades, /expenses)', () => {
    for (const fixed of MOBILE_FIXED_HREFS) {
      expect(items.some((i) => i.href === fixed)).toBe(false)
    }
  })

  it('hiddenOnMobile 항목은 제외 (/settings)', () => {
    expect(items.some((i) => i.href === '/settings')).toBe(false)
  })

  it('사이드바에 있는 신규 페이지들이 모바일 더보기에 포함됨 (#391 회귀 방지)', () => {
    const hrefs = items.map((i) => i.href)
    for (const href of ['/strategies', '/watchlist', '/vesting', '/budgets', '/recurring', '/assets']) {
      expect(hrefs).toContain(href)
    }
  })

  it('중복 항목 없음', () => {
    const hrefs = items.map((i) => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})

describe('deriveMobileMoreItems (합성 NAV_GROUPS)', () => {
  const fixture: NavGroup[] = [
    {
      title: 'A',
      items: [
        { href: '/', icon: '🏠', label: 'Home' },
        { href: '/x', icon: '🔴', label: 'X' },
        { href: '/y', icon: '🔵', label: 'Y', hiddenOnMobile: true },
      ],
    },
    {
      title: 'B',
      items: [
        { href: '/z', icon: '🟢', label: 'Z' },
      ],
    },
  ]

  it('사이드바 순서 유지', () => {
    const result = deriveMobileMoreItems(fixture, ['/'])
    expect(result.map((i) => i.href)).toEqual(['/x', '/z'])
  })

  it('fixedHrefs 로 지정한 경로 제외', () => {
    const result = deriveMobileMoreItems(fixture, ['/x'])
    expect(result.map((i) => i.href)).toEqual(['/', '/z'])
  })

  it('빈 그룹 → 빈 배열', () => {
    expect(deriveMobileMoreItems([], [])).toEqual([])
  })
})

describe('isPathActive', () => {
  it('/ 는 정확히 매칭', () => {
    expect(isPathActive('/', '/')).toBe(true)
    expect(isPathActive('/foo', '/')).toBe(false)
  })

  it('정확 매치 + startsWith', () => {
    expect(isPathActive('/trades', '/trades')).toBe(true)
    expect(isPathActive('/trades/new', '/trades')).toBe(true)
    expect(isPathActive('/tradings', '/trades')).toBe(false)
  })
})

describe('findActiveGroup', () => {
  it('실제 NAV_GROUPS 에서 /strategies 는 AI & 전략 그룹', () => {
    expect(findActiveGroup('/strategies')).toBe('AI & 전략')
  })

  it('/expenses 는 가계부 그룹', () => {
    expect(findActiveGroup('/expenses')).toBe('가계부')
  })

  it('매칭 없으면 null', () => {
    expect(findActiveGroup('/no-such-page')).toBe(null)
  })
})

describe('NAV_GROUPS 정합성', () => {
  it('모든 그룹 아이템의 href 가 유일', () => {
    const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href))
    expect(new Set(all).size).toBe(all.length)
  })

  it('MOBILE_FIXED_HREFS 는 실제 NAV_GROUPS 에 존재', () => {
    const allHrefs = new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)))
    for (const fixed of MOBILE_FIXED_HREFS) {
      expect(allHrefs.has(fixed)).toBe(true)
    }
  })
})
