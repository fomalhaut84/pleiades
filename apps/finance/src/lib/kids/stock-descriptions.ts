/**
 * 아이 친화적 종목 설명
 * ticker → { emoji, description }
 */

const STOCK_DESCRIPTIONS: Record<string, { emoji: string; desc: string }> = {
  AAPL: { emoji: '🍎', desc: '아이폰, 맥북 만드는 회사' },
  MSFT: { emoji: '💻', desc: '윈도우, 엑스박스 만드는 회사' },
  NVDA: { emoji: '🎮', desc: '게임용 그래픽카드 만드는 회사' },
  RKLB: { emoji: '🚀', desc: '우주로 로켓 쏘는 회사' },
  AMZN: { emoji: '📦', desc: '인터넷 쇼핑몰 아마존' },
  GOOGL: { emoji: '🔍', desc: '구글 검색, 유튜브 만드는 회사' },
  TSLA: { emoji: '🚗', desc: '전기자동차 테슬라' },
  META: { emoji: '👥', desc: '인스타그램, 페이스북 만드는 회사' },
  '005930': { emoji: '📱', desc: '삼성 갤럭시 만드는 회사' },
  '035720': { emoji: '💬', desc: '카카오톡 만드는 회사' },
}

const DEFAULT_DESC = { emoji: '🏢', desc: '여러 가지를 만드는 회사' }

export function getStockDescription(ticker: string): { emoji: string; desc: string } {
  // 한국 ETF는 displayName으로 매칭
  return STOCK_DESCRIPTIONS[ticker] ?? DEFAULT_DESC
}

/** displayName 기반 매칭 (ETF 등) */
export function getDescriptionByName(displayName: string): { emoji: string; desc: string } {
  if (displayName.includes('S&P500') || displayName.includes('S&P')) return { emoji: '🐯', desc: '미국 500대 회사에 골고루 투자' }
  if (displayName.includes('나스닥') || displayName.includes('NASDAQ')) return { emoji: '💡', desc: '미국 기술 회사들에 투자' }
  if (displayName.includes('배당')) return { emoji: '🎁', desc: '용돈(배당금) 잘 주는 회사들' }
  if (displayName.includes('카카오')) return { emoji: '💬', desc: '카카오톡 만드는 회사' }
  if (displayName.includes('삼성')) return { emoji: '📱', desc: '삼성 갤럭시 만드는 회사' }
  if (displayName.includes('로보틱스') || displayName.includes('로봇')) return { emoji: '🤖', desc: '로봇 만드는 회사' }
  return DEFAULT_DESC
}
