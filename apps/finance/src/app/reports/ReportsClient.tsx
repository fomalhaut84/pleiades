'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'

interface Report {
  id: string
  year: number
  quarter: number
  title: string
  pdfPath: string | null
  aiComment: string | null
  createdAt: string
}

const QUARTER_LABELS = ['', '1분기 (1~3월)', '2분기 (4~6월)', '3분기 (7~9월)', '4분기 (10~12월)']

export default function ReportsClient() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genYear, setGenYear] = useState(new Date().getFullYear())
  const [genQuarter, setGenQuarter] = useState(1)

  const fetchReports = () => {
    fetch('/api/reports')
      .then((r) => {
        if (!r.ok) throw new Error('API error')
        return r.json()
      })
      .then((d) => setReports(d.reports ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchReports() }, [])

  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: genYear, quarter: genQuarter }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || '리포트 생성 실패')
        return
      }
      fetchReports()
    } catch {
      alert('리포트 생성에 실패했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = (id: string, title: string) => {
    const a = document.createElement('a')
    a.href = `/api/reports/${id}/download`
    a.download = `${title}.pdf`
    a.click()
  }

  if (loading) {
    return <div className="p-8 text-center text-sub">로딩 중...</div>
  }

  return (
    <div className="px-4 sm:px-8 py-6 max-w-[900px] mx-auto">
      {/* 리포트 생성 */}
      <Card className="mb-6">
        <div className="text-[13px] font-bold text-bright mb-4">📊 리포트 생성</div>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-[11px] text-sub block mb-1">연도</label>
            <select
              value={genYear}
              onChange={(e) => setGenYear(Number(e.target.value))}
              className="bg-surface border border-border rounded-lg px-3 py-2 text-[13px] text-text"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-sub block mb-1">분기</label>
            <select
              value={genQuarter}
              onChange={(e) => setGenQuarter(Number(e.target.value))}
              className="bg-surface border border-border rounded-lg px-3 py-2 text-[13px] text-text"
            >
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>{q}분기</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-5 py-2 bg-sejin/15 text-sejin border border-sejin/20
              rounded-lg text-[13px] font-semibold
              hover:bg-sejin/25 disabled:opacity-30
              transition-all"
          >
            {generating ? '생성 중...' : '생성'}
          </button>
        </div>
        {generating && (
          <div className="text-[11px] text-sub mt-3">
            AI 분석 + PDF 생성 중... 2~3분 소요될 수 있습니다.
          </div>
        )}
      </Card>

      {/* 리포트 목록 */}
      <Card>
        <div className="text-[13px] font-bold text-bright mb-4">📋 리포트 목록</div>
        {reports.length === 0 ? (
          <div className="text-[12px] text-sub py-4 text-center">
            아직 생성된 리포트가 없습니다.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {reports.map((r) => (
              <div
                key={r.id}
                className="flex justify-between items-center px-4 py-3 bg-surface-dim rounded-[10px]"
              >
                <div>
                  <div className="text-[13px] text-text font-medium">
                    📊 {r.year}년 {QUARTER_LABELS[r.quarter]}
                  </div>
                  <div className="text-[11px] text-dim mt-0.5">
                    생성: {new Date(r.createdAt).toLocaleDateString('ko-KR')}
                  </div>
                </div>
                <div className="flex gap-2">
                  {r.pdfPath ? (
                    <button
                      onClick={() => handleDownload(r.id, r.title)}
                      className="px-3 py-1.5 bg-sejin/15 text-sejin border border-sejin/20
                        rounded-lg text-[12px] font-medium hover:bg-sejin/25 transition-all"
                    >
                      📥 다운로드
                    </button>
                  ) : (
                    <span className="text-[11px] text-dim px-3 py-1.5">PDF 미생성</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
