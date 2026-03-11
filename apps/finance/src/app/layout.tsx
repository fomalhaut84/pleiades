import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'
import BottomTab from '@/components/layout/BottomTab'
import MainContent from '@/components/layout/MainContent'
import AuthProvider from '@/components/auth/AuthProvider'
import ThemeProvider from '@/components/theme/ThemeProvider'
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
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <AuthProvider>
            <Sidebar accounts={accounts} />
            <BottomTab accounts={accounts} />
            <MainContent>
              {children}
            </MainContent>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
