import Header from '@/components/layout/Header'
import McpLogsClient from './McpLogsClient'

export const dynamic = 'force-dynamic'

export default function McpLogsPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[1200px]">
      <Header
        title="MCP 로그"
        sub="myFinance MCP 서버 pino 로그 뷰어 (일반/크래시 파일별, level·msg·tool·traceId 필터)"
      />
      <div className="mt-5">
        <McpLogsClient />
      </div>
    </div>
  )
}
