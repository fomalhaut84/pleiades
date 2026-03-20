import Header from '@/components/layout/Header'
import NetWorthClient from './NetWorthClient'

export const dynamic = 'force-dynamic'

export default function NetWorthPage() {
  return (
    <>
      <Header title="순자산" sub="가족 전체 자산 현황" />
      <NetWorthClient />
    </>
  )
}
