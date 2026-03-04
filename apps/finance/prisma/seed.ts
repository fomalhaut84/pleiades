import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SEED_FX_RATE = 1450 // USD/KRW 시드 초기값

async function main() {
  // 기존 데이터 정리 (새 모델 추가 시 여기에 deleteMany 추가 필요)
  await prisma.$transaction([
    prisma.deposit.deleteMany(),
    prisma.trade.deleteMany(),
    prisma.holding.deleteMany(),
    prisma.rSUSchedule.deleteMany(),
    prisma.priceCache.deleteMany(),
    prisma.account.deleteMany(),
  ])

  // === 계좌 생성 ===
  const sejin = await prisma.account.create({
    data: { name: '세진', strategy: 'index-focus', horizon: null },
  })

  const sodam = await prisma.account.create({
    data: { name: '소담', ownerAge: 9, strategy: 'balanced', horizon: 10 },
  })

  const dasom = await prisma.account.create({
    data: { name: '다솜', ownerAge: 5, strategy: 'growth', horizon: 15 },
  })

  // === 세진 보유종목 (7개) ===
  const sejinHoldings = [
    { ticker: 'AAPL', displayName: 'AAPL', market: 'US', shares: 6, avgPriceFx: 105.795, currency: 'USD' },
    { ticker: 'MSFT', displayName: 'MSFT', market: 'US', shares: 4, avgPriceFx: 319.611, currency: 'USD' },
    { ticker: 'NVDA', displayName: 'NVDA', market: 'US', shares: 10, avgPriceFx: 120.518, currency: 'USD' },
    { ticker: 'RKLB', displayName: 'RKLB', market: 'US', shares: 16, avgPriceFx: 6.05, currency: 'USD' },
    { ticker: '035720.KS', displayName: '카카오', market: 'KR', shares: 1, avgPrice: 45000, currency: 'KRW' },
    { ticker: '454910.KS', displayName: '두산로보틱스', market: 'KR', shares: 2, avgPrice: 26000, currency: 'KRW' },
    { ticker: '241560.KQ', displayName: '컨텍', market: 'KR', shares: 12, avgPrice: 22500, currency: 'KRW' },
  ]

  for (const h of sejinHoldings) {
    const avgPrice = h.avgPriceFx ? Math.round(h.avgPriceFx * SEED_FX_RATE) : h.avgPrice!
    await prisma.holding.create({
      data: {
        accountId: sejin.id,
        ticker: h.ticker,
        displayName: h.displayName,
        market: h.market,
        shares: h.shares,
        avgPrice,
        currency: h.currency,
        avgPriceFx: h.avgPriceFx ?? null,
        avgFxRate: h.avgPriceFx ? SEED_FX_RATE : null,
      },
    })
  }

  // === 소담 보유종목 (5개) ===
  const sodamHoldings = [
    { ticker: 'AAPL', displayName: 'AAPL', market: 'US', shares: 11, avgPriceFx: 212.255, currency: 'USD' },
    { ticker: 'XAR', displayName: 'XAR', market: 'US', shares: 3, avgPriceFx: 171.445, currency: 'USD' },
    { ticker: '446720.KS', displayName: 'SOL 미국배당다우존스', market: 'KR', shares: 120, avgPrice: 12036, currency: 'KRW' },
    { ticker: '472150.KS', displayName: 'SOL 미국배당미국채혼합50', market: 'KR', shares: 72, avgPrice: 10785, currency: 'KRW' },
    { ticker: '360750.KS', displayName: 'TIGER 미국S&P500', market: 'KR', shares: 46, avgPrice: 24494, currency: 'KRW' },
  ]

  for (const h of sodamHoldings) {
    const avgPrice = h.avgPriceFx ? Math.round(h.avgPriceFx * SEED_FX_RATE) : h.avgPrice!
    await prisma.holding.create({
      data: {
        accountId: sodam.id,
        ticker: h.ticker,
        displayName: h.displayName,
        market: h.market,
        shares: h.shares,
        avgPrice,
        currency: h.currency,
        avgPriceFx: h.avgPriceFx ?? null,
        avgFxRate: h.avgPriceFx ? SEED_FX_RATE : null,
      },
    })
  }

  // === 다솜 보유종목 (5개) ===
  const dasomHoldings = [
    { ticker: 'AAPL', displayName: 'AAPL', market: 'US', shares: 3, avgPriceFx: 225.80, currency: 'USD' },
    { ticker: 'XAR', displayName: 'XAR', market: 'US', shares: 2, avgPriceFx: 171.50, currency: 'USD' },
    { ticker: 'RKLB', displayName: 'RKLB', market: 'US', shares: 5, avgPriceFx: 28.60, currency: 'USD' },
    { ticker: '360750.KS', displayName: 'TIGER 미국S&P500', market: 'KR', shares: 36, avgPrice: 24290, currency: 'KRW' },
    { ticker: '446720.KS', displayName: 'SOL 미국배당다우존스', market: 'KR', shares: 18, avgPrice: 13485, currency: 'KRW' },
  ]

  for (const h of dasomHoldings) {
    const avgPrice = h.avgPriceFx ? Math.round(h.avgPriceFx * SEED_FX_RATE) : h.avgPrice!
    await prisma.holding.create({
      data: {
        accountId: dasom.id,
        ticker: h.ticker,
        displayName: h.displayName,
        market: h.market,
        shares: h.shares,
        avgPrice,
        currency: h.currency,
        avgPriceFx: h.avgPriceFx ?? null,
        avgFxRate: h.avgPriceFx ? SEED_FX_RATE : null,
      },
    })
  }

  // === RSU 스케줄 (2건) ===
  await prisma.rSUSchedule.createMany({
    data: [
      {
        vestingDate: new Date('2026-04-09'),
        shares: 135,
        basisValue: 5000000,
        status: 'pending',
        sellShares: 70,
        keepShares: 65,
        note: '1차 베스팅',
      },
      {
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

  // === 증여 기록 ===
  // 소담: 누적 ~740만원
  await prisma.deposit.createMany({
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

  // 다솜: 누적 ~278만원
  await prisma.deposit.createMany({
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

  console.log('Seed completed:')
  console.log(`  Accounts: 3 (${sejin.name}, ${sodam.name}, ${dasom.name})`)
  console.log(`  Holdings: ${sejinHoldings.length + sodamHoldings.length + dasomHoldings.length}`)
  console.log('  RSU Schedules: 2')
  console.log('  Deposits: 4')
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
