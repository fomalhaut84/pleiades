import Header from '@/components/layout/Header'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[800px]">
      <Header title="설정" />
      <div className="mt-5">
        <SettingsClient />
      </div>
    </div>
  )
}
