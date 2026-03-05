import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'
import BottomTab from '@/components/layout/BottomTab'
import { prisma } from '@/lib/prisma'

export const metadata: Metadata = {
  title: 'myFinance - 가족 자산관리',
  description: '가족 투자 포트폴리오 통합 관리 시스템',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  let accounts: { id: string; name: string; ownerAge: number | null }[] = []
  try {
    accounts = await prisma.account.findMany({
      select: { id: true, name: true, ownerAge: true },
      orderBy: { createdAt: 'asc' },
    })
  } catch (error) {
    console.error('RootLayout: failed to fetch accounts', error)
  }

  return (
    <html lang="ko">
      <body className="antialiased">
        <Sidebar accounts={accounts} />
        <BottomTab accounts={accounts} />
        <main className="lg:ml-[220px] min-h-screen">
          {children}
        </main>
      </body>
    </html>
  )
}
