import Header from '@/components/layout/Header'
import AIClient from './AIClient'

export const dynamic = 'force-dynamic'

export default function AIPage() {
  return (
    <>
      <Header title="AI 분석" sub="포트폴리오 · 세금 · 소비 분석" />
      <AIClient />
    </>
  )
}
