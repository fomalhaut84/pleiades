'use client'

import { useState } from 'react'
import Papa from 'papaparse'
import Card from '@/components/ui/Card'
import FileDropZone from './FileDropZone'

const ACCOUNT_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  '세진': { border: 'border-sejin', bg: 'bg-sejin/10', text: 'text-sejin' },
  '소담': { border: 'border-sodam', bg: 'bg-sodam/10', text: 'text-sodam' },
  '다솜': { border: 'border-dasom', bg: 'bg-dasom/10', text: 'text-dasom' },
}

interface Account {
  id: string
  name: string
}

interface StepUploadProps {
  accounts: Account[]
  onNext: (data: {
    accountId: string
    market: 'US' | 'KR'
    currency: 'USD' | 'KRW'
    headers: string[]
    rows: Record<string, string>[]
    fileName: string
  }) => void
}

export default function StepUpload({ accounts, onNext }: StepUploadProps) {
  const [accountId, setAccountId] = useState('')
  const [market, setMarket] = useState<'US' | 'KR'>('US')
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [parseError, setParseError] = useState<string | null>(null)

  const currency = market === 'US' ? 'USD' : 'KRW'

  const handleFile = (file: File) => {
    setParseError(null)
    setHeaders([])
    setRows([])
    setFileName(file.name)

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete(results) {
        if (results.errors.length > 0 && results.data.length === 0) {
          setParseError(`파싱 오류: ${results.errors[0].message}`)
          return
        }
        if (results.data.length === 0) {
          setParseError('데이터가 없습니다.')
          return
        }
        if (results.data.length > 500) {
          setParseError('최대 500행까지 지원합니다.')
          return
        }
        const h = results.meta.fields ?? []
        if (h.length === 0) {
          setParseError('헤더를 찾을 수 없습니다.')
          return
        }
        setHeaders(h)
        setRows(results.data)
      },
      error(err) {
        setParseError(`파싱 오류: ${err.message}`)
      },
    })
  }

  const canProceed = accountId && headers.length > 0 && rows.length > 0
  const selectedAccount = accounts.find((a) => a.id === accountId)

  return (
    <div className="flex flex-col gap-5">
      {/* 계좌 선택 */}
      <Card>
        <label className="block text-[12px] font-semibold text-sub mb-2">계좌 선택</label>
        <div className="grid grid-cols-3 gap-2">
          {accounts.map((account) => {
            const colors = ACCOUNT_COLORS[account.name]
            const isActive = accountId === account.id
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => setAccountId(account.id)}
                className={`py-2.5 rounded-lg text-[13px] font-semibold border transition-all ${
                  isActive
                    ? `${colors?.bg} ${colors?.border} ${colors?.text}`
                    : 'border-white/[0.06] text-sub hover:bg-white/[0.03] hover:text-muted'
                }`}
              >
                {account.name}
              </button>
            )
          })}
        </div>
      </Card>

      {/* 시장/통화 선택 */}
      <Card>
        <label className="block text-[12px] font-semibold text-sub mb-2">시장 / 통화</label>
        <div className="grid grid-cols-2 gap-0 rounded-lg border border-white/[0.06] overflow-hidden">
          <button
            type="button"
            onClick={() => setMarket('US')}
            className={`py-2.5 text-[13px] font-bold transition-all ${
              market === 'US'
                ? 'bg-sodam/15 text-sodam'
                : 'text-sub hover:bg-white/[0.03]'
            }`}
          >
            US (USD)
          </button>
          <button
            type="button"
            onClick={() => setMarket('KR')}
            className={`py-2.5 text-[13px] font-bold border-l border-white/[0.06] transition-all ${
              market === 'KR'
                ? 'bg-amber-400/15 text-amber-400'
                : 'text-sub hover:bg-white/[0.03]'
            }`}
          >
            KR (KRW)
          </button>
        </div>
      </Card>

      {/* 파일 업로드 */}
      <Card>
        <label className="block text-[12px] font-semibold text-sub mb-2">CSV 파일</label>
        {fileName && rows.length > 0 ? (
          <div className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-3">
            <div>
              <p className="text-[13px] text-bright font-medium">{fileName}</p>
              <p className="text-[11px] text-dim mt-0.5">
                {headers.length}개 컬럼 · {rows.length}건
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFileName(null)
                setHeaders([])
                setRows([])
              }}
              className="text-[12px] text-sub hover:text-red-400 transition-colors"
            >
              제거
            </button>
          </div>
        ) : (
          <FileDropZone onFile={handleFile} />
        )}
        {parseError && (
          <p className="text-[11px] text-red-400 mt-2">{parseError}</p>
        )}
      </Card>

      {/* 미리보기 */}
      {headers.length > 0 && rows.length > 0 && (
        <Card>
          <label className="block text-[12px] font-semibold text-sub mb-2">
            미리보기 (처음 3행)
          </label>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-[11px]">
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="text-left text-dim font-medium px-2 py-1.5 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 3).map((row, i) => (
                  <tr key={i} className="border-t border-white/[0.04]">
                    {headers.map((h) => (
                      <td key={h} className="text-muted px-2 py-1.5 whitespace-nowrap max-w-[200px] truncate">
                        {row[h] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 요약 & 다음 */}
      {selectedAccount && rows.length > 0 && (
        <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="text-[12px] text-sub">
            <span className={ACCOUNT_COLORS[selectedAccount.name]?.text}>
              {selectedAccount.name}
            </span>
            {' · '}{market}/{currency}{' · '}{rows.length}건
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={!canProceed}
        onClick={() =>
          onNext({
            accountId,
            market,
            currency,
            headers,
            rows,
            fileName: fileName!,
          })
        }
        className="w-full py-3 rounded-lg text-[14px] font-bold transition-all disabled:opacity-30 bg-sodam/20 text-sodam hover:bg-sodam/30 border border-sodam/25"
      >
        컬럼 매핑으로 →
      </button>
    </div>
  )
}
