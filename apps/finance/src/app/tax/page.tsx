import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import GiftTaxGauge from '@/components/tax/GiftTaxGauge'
import { calcGiftTaxSummary, GIFT_SOURCES } from '@/lib/tax/gift-tax'

export const dynamic = 'force-dynamic'

export default async function TaxPage() {
  const accounts = await prisma.account.findMany({
    select: {
      id: true,
      name: true,
      ownerAge: true,
      deposits: {
        where: {
          source: { in: GIFT_SOURCES },
        },
        select: { amount: true, source: true, depositedAt: true },
        orderBy: { depositedAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const summaries = accounts.map((account) => {
    const isMinor = account.ownerAge != null && account.ownerAge < 19
    const summary = calcGiftTaxSummary(account.deposits, isMinor)

    return {
      accountId: account.id,
      accountName: account.name,
      ownerAge: account.ownerAge,
      isMinor,
      ...summary,
      resetDate: summary.resetDate?.toISOString() ?? null,
      firstGiftDate: summary.firstGiftDate?.toISOString() ?? null,
    }
  })

  const minorAccounts = summaries.filter((s) => s.isMinor)
  const adultGiftAccounts = summaries.filter((s) => !s.isMinor && s.totalGifted > 0)

  return (
    <div className="px-8 py-7 max-w-[960px]">
      <Header title="세금 센터" sub="증여세 · 양도세 · 배당소득세" />

      {/* 증여세 섹션 */}
      <div className="mt-6">
        <h2 className="text-[14px] font-bold text-bright mb-3">증여세 현황</h2>

        {minorAccounts.length > 0 ? (
          <div className="flex flex-col gap-4">
            {minorAccounts.map((s) => (
              <GiftTaxGauge
                key={s.accountId}
                accountName={s.accountName}
                ownerAge={s.ownerAge}
                isMinor={s.isMinor}
                totalGifted={s.totalGifted}
                exemptLimit={s.exemptLimit}
                usageRate={s.usageRate}
                remaining={s.remaining}
                estimatedTax={s.estimatedTax}
                resetDate={s.resetDate}
                firstGiftDate={s.firstGiftDate}
              />
            ))}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-8 text-center">
            <div className="text-[13px] text-sub">미성년 계좌의 증여 기록이 없습니다</div>
          </div>
        )}

        {/* 성인 계좌 증여 현황 */}
        {adultGiftAccounts.length > 0 && (
          <div className="mt-4">
            <h3 className="text-[12px] font-semibold text-sub mb-2">성인 계좌</h3>
            <div className="flex flex-col gap-4">
              {adultGiftAccounts.map((s) => (
                <GiftTaxGauge
                  key={s.accountId}
                  accountName={s.accountName}
                  ownerAge={s.ownerAge}
                  isMinor={s.isMinor}
                  totalGifted={s.totalGifted}
                  exemptLimit={s.exemptLimit}
                  usageRate={s.usageRate}
                  remaining={s.remaining}
                  estimatedTax={s.estimatedTax}
                  resetDate={s.resetDate}
                  firstGiftDate={s.firstGiftDate}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Placeholder for future tax sections */}
      <div className="mt-8 flex flex-col gap-3">
        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.04] bg-white/[0.015] px-5 py-4">
          <span className="text-[13px] text-dim">양도소득세 계산기 — Phase 4-C에서 추가 예정</span>
        </div>
        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.04] bg-white/[0.015] px-5 py-4">
          <span className="text-[13px] text-dim">배당소득세 추적 — Phase 4-F에서 추가 예정</span>
        </div>
      </div>

      <p className="text-[11px] text-dim mt-6">
        세금 정보는 참고용이며 법적 조언이 아닙니다. 정확한 세금 계산은 세무사에게 문의하세요.
      </p>
    </div>
  )
}
