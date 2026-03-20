import Header from '@/components/layout/Header'
import BacktestClient from './BacktestClient'

export const dynamic = 'force-dynamic'

export default function BacktestPage() {
  return (
    <>
      <Header title="백테스팅" sub="과거 데이터로 전략 검증" />
      <BacktestClient />
    </>
  )
}
