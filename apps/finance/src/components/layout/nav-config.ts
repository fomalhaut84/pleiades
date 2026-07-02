export interface NavItem {
  href: string
  icon: string
  label: string
  /** true 시 모바일 하단 더보기에서 제외 (기본: 포함) */
  hiddenOnMobile?: boolean
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: '포트폴리오',
    items: [
      { href: '/', icon: '📊', label: '대시보드' },
      { href: '/trades', icon: '📝', label: '종목 거래' },
      { href: '/rsu', icon: '🏢', label: 'RSU' },
      { href: '/stock-options', icon: '📊', label: '스톡옵션' },
      { href: '/vesting', icon: '📅', label: '베스팅 캘린더' },
      { href: '/dividends', icon: '💰', label: '배당금' },
      { href: '/deposits', icon: '🎁', label: '입금/증여' },
      { href: '/watchlist', icon: '👀', label: '관심종목' },
    ],
  },
  {
    title: '가계부',
    items: [
      { href: '/expenses', icon: '💸', label: '가계부' },
      { href: '/categories', icon: '🏷️', label: '카테고리' },
      { href: '/budgets', icon: '📋', label: '예산' },
      { href: '/recurring', icon: '🔄', label: '반복 거래' },
    ],
  },
  {
    title: '분석',
    items: [
      { href: '/tax', icon: '🧾', label: '세금' },
      { href: '/simulator', icon: '🔮', label: '시뮬레이터' },
      { href: '/performance', icon: '📈', label: '수익률 분석' },
    ],
  },
  {
    title: 'AI & 전략',
    items: [
      { href: '/ai', icon: '🤖', label: 'AI 분석' },
      { href: '/strategies', icon: '🧠', label: '커스텀 전략' },
      { href: '/networth', icon: '💰', label: '순자산' },
      { href: '/assets', icon: '🏦', label: '자산 관리' },
      { href: '/reports', icon: '📋', label: '리포트' },
      { href: '/backtest', icon: '🧪', label: '백테스팅' },
    ],
  },
  {
    title: '설정',
    items: [
      { href: '/settings', icon: '⚙️', label: '설정', hiddenOnMobile: true },
    ],
  },
]

/**
 * 모바일 하단 탭에서 고정으로 노출되는 경로 —
 * BottomTab.tsx 의 3개 고정 탭 (대시보드/거래/가계부) 과 동기화 유지.
 */
export const MOBILE_FIXED_HREFS: readonly string[] = ['/', '/trades', '/expenses']

/**
 * 모바일 하단 더보기 아이템 목록을 NAV_GROUPS 에서 파생.
 *
 * - 사이드바 순서 그대로 flat
 * - hiddenOnMobile=true 제외
 * - MOBILE_FIXED_HREFS 는 이미 고정 탭에 있으므로 더보기에서 제외
 *
 * 파생으로 유지해 nav-config 만 갱신하면 모바일도 자동 반영 (#391/#392).
 */
export function deriveMobileMoreItems(
  groups: NavGroup[] = NAV_GROUPS,
  fixedHrefs: readonly string[] = MOBILE_FIXED_HREFS,
): NavItem[] {
  const fixed = new Set(fixedHrefs)
  return groups
    .flatMap((g) => g.items)
    .filter((item) => !item.hiddenOnMobile && !fixed.has(item.href))
}

export function isPathActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function findActiveGroup(pathname: string): string | null {
  for (const group of NAV_GROUPS) {
    if (group.items.some((item) => isPathActive(pathname, item.href))) {
      return group.title
    }
  }
  return null
}
