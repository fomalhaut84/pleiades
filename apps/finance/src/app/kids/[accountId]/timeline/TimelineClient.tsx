'use client'

import Link from 'next/link'

interface TimelineEvent {
  date: string
  emoji: string
  title: string
  description: string
}

interface Props {
  accountName: string
  events: TimelineEvent[]
  accountId: string
}

const ACCOUNT_EMOJI: Record<string, string> = { '소담': '👧', '다솜': '👶' }

export default function TimelineClient({ accountName, events, accountId }: Props) {
  const accountEmoji = ACCOUNT_EMOJI[accountName] ?? '👤'

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 max-w-[600px] mx-auto">
      {/* 헤더 */}
      <div className="text-center mb-8">
        <h1 className="text-[28px] font-extrabold text-bright">
          📖 {accountName}이의 투자 이야기
        </h1>
        <p className="text-[14px] text-sub mt-1">
          {accountEmoji} 투자를 시작한 날부터 지금까지
        </p>
        <Link
          href={`/kids/${accountId}`}
          className="inline-block mt-3 text-[12px] text-sodam hover:text-sodam/80 transition-colors"
        >
          ← 대시보드로 돌아가기
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="text-center text-sub py-12">
          <span className="text-[48px]">📭</span>
          <p className="mt-4 text-[14px]">아직 투자 이야기가 없어요!</p>
          <p className="text-[12px] text-dim mt-1">첫 투자를 하면 여기에 기록돼요</p>
        </div>
      ) : (
        <div className="relative">
          {/* 타임라인 세로선 */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />

          <div className="flex flex-col gap-0">
            {events.map((event, i) => {
              // 연도 구분
              const year = event.date.slice(0, 4)
              const prevYear = i > 0 ? events[i - 1].date.slice(0, 4) : ''
              const showYear = year !== prevYear

              return (
                <div key={`${event.date}-${i}`}>
                  {showYear && (
                    <div className="relative pl-14 py-3">
                      <div className="absolute left-[18px] w-3 h-3 rounded-full bg-sodam border-2 border-bg" />
                      <div className="text-[16px] font-bold text-sodam">{year}년</div>
                    </div>
                  )}
                  <div className="relative pl-14 py-3">
                    <div className="absolute left-[21px] w-[7px] h-[7px] rounded-full bg-dim" />
                    <div className="bg-card border border-border rounded-[14px] p-4">
                      <div className="flex items-start gap-3">
                        <span className="text-[24px] flex-shrink-0">{event.emoji}</span>
                        <div className="flex-1">
                          <div className="text-[14px] font-bold text-bright">{event.title}</div>
                          <div className="text-[12px] text-sub mt-1">{event.description}</div>
                          <div className="text-[11px] text-dim mt-2">{event.date}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 현재 */}
          <div className="relative pl-14 py-3">
            <div className="absolute left-[18px] w-3 h-3 rounded-full bg-sejin border-2 border-bg animate-pulse" />
            <div className="text-[14px] font-bold text-sejin">
              지금! 계속 자라는 중 🌱
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
