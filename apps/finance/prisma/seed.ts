import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

type TxClient = Prisma.TransactionClient

const SEED_FX_RATE = 1450 // USD/KRW 시드 초기값

type HoldingSeed =
  | {
      ticker: string
      displayName: string
      market: 'US'
      shares: number
      avgPriceFx: number
      avgPrice?: never
      currency: 'USD'
      tradedAt: string
    }
  | {
      ticker: string
      displayName: string
      market: 'KR'
      shares: number
      avgPriceFx?: never
      avgPrice: number
      currency: 'KRW'
      tradedAt: string
    }

/**
 * Holding + 대응 Trade를 함께 생성
 */
async function createHoldingWithTrade(tx: TxClient, accountId: string, seed: HoldingSeed) {
  const isUSD = seed.currency === 'USD'
  const avgPrice = isUSD ? Math.round(seed.avgPriceFx * SEED_FX_RATE) : seed.avgPrice
  const price = isUSD ? seed.avgPriceFx : seed.avgPrice
  const totalKRW = isUSD
    ? Math.round(price * seed.shares * SEED_FX_RATE)
    : Math.round(price * seed.shares)

  await tx.holding.create({
    data: {
      accountId,
      ticker: seed.ticker,
      displayName: seed.displayName,
      market: seed.market,
      shares: seed.shares,
      avgPrice,
      currency: seed.currency,
      avgPriceFx: isUSD ? seed.avgPriceFx : null,
      avgFxRate: isUSD ? SEED_FX_RATE : null,
    },
  })

  await tx.trade.create({
    data: {
      accountId,
      ticker: seed.ticker,
      displayName: seed.displayName,
      market: seed.market,
      type: 'BUY',
      shares: seed.shares,
      price,
      currency: seed.currency,
      fxRate: isUSD ? SEED_FX_RATE : null,
      totalKRW,
      note: '초기 보유분',
      tradedAt: new Date(seed.tradedAt),
    },
  })
}

async function main() {
  // === 시드 데이터 정의 ===
  const sejinHoldings: HoldingSeed[] = [
    { ticker: 'AAPL', displayName: 'AAPL', market: 'US', shares: 6, avgPriceFx: 105.795, currency: 'USD', tradedAt: '2024-03-15' },
    { ticker: 'MSFT', displayName: 'MSFT', market: 'US', shares: 4, avgPriceFx: 319.611, currency: 'USD', tradedAt: '2024-02-20' },
    { ticker: 'NVDA', displayName: 'NVDA', market: 'US', shares: 10, avgPriceFx: 120.518, currency: 'USD', tradedAt: '2024-06-20' },
    { ticker: 'RKLB', displayName: 'RKLB', market: 'US', shares: 16, avgPriceFx: 6.05, currency: 'USD', tradedAt: '2024-01-10' },
    { ticker: '035720.KS', displayName: '카카오', market: 'KR', shares: 1, avgPrice: 45000, currency: 'KRW', tradedAt: '2025-02-01' },
    { ticker: '454910.KS', displayName: '두산로보틱스', market: 'KR', shares: 2, avgPrice: 26000, currency: 'KRW', tradedAt: '2025-03-01' },
    { ticker: '451760.KQ', displayName: '컨텍', market: 'KR', shares: 12, avgPrice: 22500, currency: 'KRW', tradedAt: '2025-01-15' },
  ]

  const sodamHoldings: HoldingSeed[] = [
    { ticker: 'AAPL', displayName: 'AAPL', market: 'US', shares: 11, avgPriceFx: 212.255, currency: 'USD', tradedAt: '2025-01-10' },
    { ticker: 'XAR', displayName: 'XAR', market: 'US', shares: 3, avgPriceFx: 171.445, currency: 'USD', tradedAt: '2025-06-15' },
    { ticker: '446720.KS', displayName: 'SOL 미국배당다우존스', market: 'KR', shares: 120, avgPrice: 12036, currency: 'KRW', tradedAt: '2024-08-01' },
    { ticker: '472150.KS', displayName: 'SOL 미국배당미국채혼합50', market: 'KR', shares: 72, avgPrice: 10785, currency: 'KRW', tradedAt: '2024-08-01' },
    { ticker: '360750.KS', displayName: 'TIGER 미국S&P500', market: 'KR', shares: 46, avgPrice: 24494, currency: 'KRW', tradedAt: '2024-09-15' },
  ]

  const dasomHoldings: HoldingSeed[] = [
    { ticker: 'AAPL', displayName: 'AAPL', market: 'US', shares: 3, avgPriceFx: 225.80, currency: 'USD', tradedAt: '2025-02-01' },
    { ticker: 'XAR', displayName: 'XAR', market: 'US', shares: 2, avgPriceFx: 171.50, currency: 'USD', tradedAt: '2025-06-15' },
    { ticker: 'RKLB', displayName: 'RKLB', market: 'US', shares: 5, avgPriceFx: 28.60, currency: 'USD', tradedAt: '2025-08-20' },
    { ticker: '360750.KS', displayName: 'TIGER 미국S&P500', market: 'KR', shares: 36, avgPrice: 24290, currency: 'KRW', tradedAt: '2025-02-15' },
    { ticker: '446720.KS', displayName: 'SOL 미국배당다우존스', market: 'KR', shares: 18, avgPrice: 13485, currency: 'KRW', tradedAt: '2025-09-01' },
  ]

  // === 삭제 + 생성을 단일 트랜잭션으로 실행 (all-or-nothing) ===
  await prisma.$transaction(async (tx) => {
    // 기존 데이터 정리 (FK 순서)
    await tx.transaction.deleteMany()
    await tx.budget.deleteMany()
    await tx.category.deleteMany()
    await tx.holdingSnapshot.deleteMany()
    await tx.portfolioSnapshot.deleteMany()
    await tx.benchmarkPrice.deleteMany()
    await tx.stockOptionVesting.deleteMany()
    await tx.stockOption.deleteMany()
    await tx.deposit.deleteMany()
    await tx.trade.deleteMany()
    await tx.holding.deleteMany()
    await tx.rSUSchedule.deleteMany()
    await tx.priceCache.deleteMany()
    await tx.account.deleteMany()

    // 계좌 생성
    const sejin = await tx.account.create({
      data: { name: '세진', strategy: 'index-focus', horizon: null, benchmarkTicker: '^GSPC' },
    })
    const sodam = await tx.account.create({
      data: { name: '소담', ownerAge: 9, strategy: 'balanced', horizon: 10, benchmarkTicker: 'SCHD' },
    })
    const dasom = await tx.account.create({
      data: { name: '다솜', ownerAge: 5, strategy: 'growth', horizon: 15, benchmarkTicker: '^IXIC' },
    })

    // 보유종목 + Trade 생성
    for (const seed of sejinHoldings) {
      await createHoldingWithTrade(tx, sejin.id, seed)
    }
    for (const seed of sodamHoldings) {
      await createHoldingWithTrade(tx, sodam.id, seed)
    }
    for (const seed of dasomHoldings) {
      await createHoldingWithTrade(tx, dasom.id, seed)
    }

    // RSU 스케줄 (세진 계좌 연동)
    await tx.rSUSchedule.createMany({
      data: [
        {
          accountId: sejin.id,
          vestingDate: new Date('2026-04-09'),
          shares: 135,
          basisValue: 5000000,
          status: 'pending',
          sellShares: 70,
          keepShares: 65,
          note: '1차 베스팅',
        },
        {
          accountId: sejin.id,
          vestingDate: new Date('2027-04-09'),
          shares: 83,
          basisValue: 5000000,
          status: 'pending',
          sellShares: 45,
          keepShares: 38,
          note: '2차 베스팅 (예상)',
        },
      ],
    })

    // 증여 기록 — 소담: 누적 ~740만원
    await tx.deposit.createMany({
      data: [
        {
          accountId: sodam.id,
          amount: 4000000,
          source: 'gift',
          note: '투자 시작 증여',
          depositedAt: new Date('2024-06-01'),
        },
        {
          accountId: sodam.id,
          amount: 3400000,
          source: 'gift',
          note: '추가 증여',
          depositedAt: new Date('2025-03-01'),
        },
      ],
    })

    // 증여 기록 — 다솜: 누적 ~278만원
    await tx.deposit.createMany({
      data: [
        {
          accountId: dasom.id,
          amount: 1500000,
          source: 'gift',
          note: '투자 시작 증여',
          depositedAt: new Date('2025-01-15'),
        },
        {
          accountId: dasom.id,
          amount: 1280000,
          source: 'gift',
          note: '추가 증여',
          depositedAt: new Date('2025-12-01'),
        },
      ],
    })
    // 스톡옵션 (세진 계좌 — 카카오)
    const soGrants = [
      {
        ticker: '035720.KS',
        displayName: '카카오',
        grantDate: '2021-05-04',
        expiryDate: '2028-05-04',
        strikePrice: 116449,
        totalShares: 200,
        adjustedShares: -5,
        remainingShares: 195,
        // 전량 행사 가능 (2년 경과)
        vestings: [
          { vestingDate: '2023-05-04', shares: 195, status: 'exercisable' },
        ],
      },
      {
        ticker: '035720.KS',
        displayName: '카카오',
        grantDate: '2022-03-29',
        expiryDate: '2029-03-29',
        strikePrice: 103359,
        totalShares: 200,
        adjustedShares: -5,
        remainingShares: 195,
        // 전량 행사 가능 (2년 경과)
        vestings: [
          { vestingDate: '2024-03-29', shares: 195, status: 'exercisable' },
        ],
      },
      {
        ticker: '035720.KS',
        displayName: '카카오',
        grantDate: '2023-03-28',
        expiryDate: '2030-03-28',
        strikePrice: 62760,
        totalShares: 200,
        adjustedShares: -3,
        remainingShares: 197,
        vestings: [
          { vestingDate: '2025-03-28', shares: 99, status: 'exercisable' },
          { vestingDate: '2026-03-28', shares: 98, status: 'pending' },
        ],
      },
      {
        ticker: '035720.KS',
        displayName: '카카오',
        grantDate: '2024-03-28',
        expiryDate: '2031-03-28',
        strikePrice: 54943,
        totalShares: 200,
        adjustedShares: -2,
        remainingShares: 198,
        vestings: [
          { vestingDate: '2026-03-28', shares: 99, status: 'pending' },
          { vestingDate: '2027-03-28', shares: 99, status: 'pending' },
        ],
      },
    ]

    for (const grant of soGrants) {
      const so = await tx.stockOption.create({
        data: {
          accountId: sejin.id,
          ticker: grant.ticker,
          displayName: grant.displayName,
          grantDate: new Date(grant.grantDate),
          expiryDate: new Date(grant.expiryDate),
          strikePrice: grant.strikePrice,
          totalShares: grant.totalShares,
          adjustedShares: grant.adjustedShares,
          remainingShares: grant.remainingShares,
        },
      })

      await tx.stockOptionVesting.createMany({
        data: grant.vestings.map((v) => ({
          stockOptionId: so.id,
          vestingDate: new Date(v.vestingDate),
          shares: v.shares,
          status: v.status,
        })),
      })
    }

    // === 카테고리 시드 ===
    const categories = [
      // 소비
      { slug: 'food', name: '식비', type: 'expense', icon: '🍚', keywords: ['점심', '저녁', '아침', '커피', '카페', '배달', '식사', '간식', '음료', '밥'], sortOrder: 1 },
      { slug: 'transport', name: '교통', type: 'expense', icon: '🚗', keywords: ['택시', '버스', '지하철', '주유', '기름', '톨비', '주차', '교통'], sortOrder: 2 },
      { slug: 'living', name: '생활', type: 'expense', icon: '🏠', keywords: ['마트', '생필품', '세탁', '관리비', '공과금', '전기', '수도', '가스'], sortOrder: 3 },
      { slug: 'medical', name: '의료', type: 'expense', icon: '🏥', keywords: ['병원', '약국', '치과', '안과', '건강검진', '약'], sortOrder: 4 },
      { slug: 'education', name: '교육', type: 'expense', icon: '📚', keywords: ['학원', '교재', '학비', '수업', '강의', '책'], sortOrder: 5 },
      { slug: 'shopping', name: '쇼핑', type: 'expense', icon: '🛍️', keywords: ['쇼핑', '옷', '신발', '가전', '전자기기'], sortOrder: 6 },
      { slug: 'leisure', name: '여가', type: 'expense', icon: '🎮', keywords: ['영화', '게임', '여행', '숙소', '운동', '헬스', '넷플릭스'], sortOrder: 7 },
      { slug: 'social', name: '경조사', type: 'expense', icon: '💐', keywords: ['축의금', '조의금', '선물', '생일', '꽃'], sortOrder: 8 },
      { slug: 'etc-expense', name: '기타', type: 'expense', icon: '📦', keywords: [], sortOrder: 99 },
      // 수입
      { slug: 'salary', name: '월급', type: 'income', icon: '💰', keywords: ['월급', '급여', '보너스', '상여', '성과급'], sortOrder: 1 },
      { slug: 'side-income', name: '부수입', type: 'income', icon: '💵', keywords: ['부수입', '알바', '프리랜서', '용돈'], sortOrder: 2 },
      { slug: 'etc-income', name: '기타수입', type: 'income', icon: '📥', keywords: [], sortOrder: 99 },
      // 이체
      { slug: 'savings', name: '적금', type: 'transfer', icon: '🏦', keywords: ['적금', '저축'], sortOrder: 1 },
      { slug: 'deposit', name: '예금', type: 'transfer', icon: '💳', keywords: ['예금', '정기예금'], sortOrder: 2 },
      { slug: 'investment', name: '투자계좌', type: 'transfer', icon: '📈', keywords: ['투자', '증권', '주식계좌'], sortOrder: 3 },
      { slug: 'etc-transfer', name: '기타이체', type: 'transfer', icon: '🔄', keywords: ['이체', '송금'], sortOrder: 99 },
    ]

    await tx.category.createMany({ data: categories })
  })

  // AlertConfig 기본값 (upsert — 기존 값 유지)
  const alertDefaults = [
    { key: 'price_drop_pct', value: '-5', label: '급락 알림 (%)' },
    { key: 'price_surge_pct', value: '5', label: '급등 알림 (%)' },
    { key: 'fx_change_krw', value: '50', label: '환율 변동 알림 (원)' },
    { key: 'budget_warn_pct', value: '80', label: '예산 경고 (%)' },
    { key: 'daily_summary_hour', value: '8', label: '일일 요약 시각 (KST)' },
    { key: 'monthly_report_day', value: '1', label: '월간 리포트 발송일' },
  ]
  for (const cfg of alertDefaults) {
    await prisma.alertConfig.upsert({
      where: { key: cfg.key },
      update: {},
      create: cfg,
    })
  }

  const totalHoldings = sejinHoldings.length + sodamHoldings.length + dasomHoldings.length
  console.log('Seed completed:')
  console.log(`  Accounts: 3`)
  console.log(`  Holdings: ${totalHoldings}`)
  console.log(`  Trades: ${totalHoldings} (초기 보유분)`)
  console.log('  RSU Schedules: 2')
  console.log('  Deposits: 4')
  console.log('  Stock Options: 4 (카카오, 베스팅 7건)')
  console.log('  Categories: 16 (소비 9 + 수입 3 + 이체 4)')
  console.log(`  AlertConfig: ${alertDefaults.length}`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
