'use client'

import { usePathname } from 'next/navigation'

interface MainContentProps {
  children: React.ReactNode
}

export default function MainContent({ children }: MainContentProps) {
  const pathname = usePathname()
  const isAuth = pathname.startsWith('/auth')

  return (
    <main className={isAuth ? 'min-h-screen' : 'lg:ml-[220px] min-h-screen pb-20 lg:pb-0'}>
      {children}
    </main>
  )
}
