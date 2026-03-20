export interface NavItem {
  href: string
  icon: string
  label: string
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
      { href: '/dividends', icon: '💰', label: '배당금' },
      { href: '/deposits', icon: '🎁', label: '입금/증여' },
      { href: '/stock-options', icon: '📊', label: '스톡옵션' },
    ],
  },
  {
    title: '가계부',
    items: [
      { href: '/expenses', icon: '💸', label: '가계부' },
      { href: '/categories', icon: '🏷️', label: '카테고리' },
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
      { href: '/networth', icon: '💰', label: '순자산' },
      { href: '/reports', icon: '📋', label: '분기 리포트' },
      { href: '/backtest', icon: '🧪', label: '백테스팅' },
    ],
  },
]

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
