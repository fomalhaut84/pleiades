import Header from '@/components/layout/Header'
import ReportsClient from './ReportsClient'

export const dynamic = 'force-dynamic'

export default function ReportsPage() {
  return (
    <>
      <Header title="분기 리포트" sub="PDF 리포트 열람 · 다운로드" />
      <ReportsClient />
    </>
  )
}
