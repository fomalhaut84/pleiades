# [Phase 25-G-3] Holding diff 토스트

## 목적

거래 생성/수정 직후 보유 수량과 평단가가 어떻게 변했는지 토스트로 즉시 알린다. 현재는 `router.push`/`router.refresh` 만 수행해 사용자가 변경을 따로 확인해야 함. 동시에 프로젝트 전반에서 재사용할 토스트 인프라를 도입.

## 배경

- `createTrade` 는 이미 `{ trade, holding }` 반환 구조 — `holdingBefore` 만 추가하면 diff 계산 가능
- 토스트 시스템 부재 (`setError` 박스만 사용)
- DELETE 응답은 25-E 에서 `204 No Content` 로 통일됨 → DELETE 토스트는 본 스코프에서 제외

## 요구사항

- [ ] `src/components/ui/Toast.tsx` 토스트 인프라 (Context + Provider + 컴포넌트 + `useToast()` 훅)
- [ ] `src/app/layout.tsx` 에 `<ToastProvider>` 추가
- [ ] `src/lib/trade-service.ts` `CreateTradeResult` 에 `holdingBefore` 추가, transaction 시작 시 select
- [ ] `src/app/api/trades/[id]/route.ts` PUT 응답에 `holdingBefore`/`holdingAfter` 추가
- [ ] `src/lib/holding-diff.ts` 신규 — `formatHoldingDiff(ticker, type, shares, before, after, currency)` 헬퍼
- [ ] `TradeForm` 생성 후 토스트 표시
- [ ] `EditPanel` 수정 후 토스트 표시
- [ ] `holding-diff` 단위 테스트 (5 케이스: 첫 매수, 추가 매수, 부분 매도, 전량 매도, 수정)

## 기술 설계

### 1. Toast 인프라

```tsx
// src/components/ui/Toast.tsx
'use client'
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'

type ToastVariant = 'success' | 'error' | 'info'

interface Toast {
  id: string
  variant: ToastVariant
  title: string
  description?: string
}

interface ToastContextValue {
  show: (toast: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const show = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [...prev, { ...toast, id }].slice(-3)) // 최대 3개
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        role="region"
        aria-label="알림"
        className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-[360px] w-[calc(100vw-2rem)]"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [paused, onDismiss])

  const accent = {
    success: 'border-l-emerald-500',
    error: 'border-l-red-500',
    info: 'border-l-sky-500',
  }[toast.variant]

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`bg-bg-raised border border-border ${accent} border-l-4 rounded-lg px-4 py-3 shadow-xl`}
      role="status"
    >
      <p className="text-[13px] font-semibold text-bright">{toast.title}</p>
      {toast.description && (
        <p className="text-[12px] text-sub mt-1 leading-relaxed">{toast.description}</p>
      )}
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
```

### 2. API 응답 확장

`trade-service.ts`:
```ts
export interface CreateTradeResult {
  trade: { ... }
  holding: { shares, avgPrice, avgPriceFx, avgFxRate } | null
  holdingBefore: { shares, avgPrice, avgPriceFx, avgFxRate } | null  // 신규
}
```

transaction 시작 부분에 `tx.holding.findUnique(...)` 한 번 더 추가 (이미 SELL 검증에서 select하므로 변수 재활용 가능).

`PUT /api/trades/[id]`:
```ts
// recalcHoldingFromTrades 전에 select holding → holdingBefore
// 끝나고 select 또는 결과 반환
return NextResponse.json({ trade: updated, holding: after, holdingBefore: before })
```

### 3. holding-diff 헬퍼

```ts
// src/lib/holding-diff.ts
interface HoldingSnapshot {
  shares: number
  avgPrice: number       // KRW 환산
  avgPriceFx: number | null  // USD 평단가
  avgFxRate: number | null
}

export interface HoldingDiff {
  title: string
  description: string
}

export function formatHoldingDiff(args: {
  ticker: string
  displayName: string
  type: 'BUY' | 'SELL'
  shares: number
  before: HoldingSnapshot | null
  after: HoldingSnapshot | null
  currency: string
}): HoldingDiff
```

규칙:
- 첫 매수 (`before === null`): `"<name> <shares>주 매수 — 신규 보유 (평단 X)"`
- 추가 매수 (`before.shares > 0 && type === 'BUY'`): `"보유 X → Y주, 평단 A → B"`
- 부분 매도: `"보유 X → Y주 (평단 변동 없음)"`
- 전량 매도 (`after === null || after.shares === 0`): `"<name> <shares>주 매도 — 보유 종료"`

USD 종목은 `avgPriceFx` 가 있으면 USD 표시, 없으면 KRW.

### 4. 호출자 통합

```tsx
// TradeForm.tsx
const { show } = useToast()
// ... res 처리 후
const result = await res.json()
const diff = formatHoldingDiff({
  ticker, displayName, type: tradeType,
  shares: parsedShares,
  before: result.holdingBefore,
  after: result.holding,
  currency,
})
show({ variant: 'success', title: diff.title, description: diff.description })
router.push('/trades')
```

### 5. 단위 테스트 (`__tests__/holding-diff.test.ts`)

- 첫 매수 KRW / USD
- 추가 매수 평단 변동
- 부분 매도 평단 변동 없음
- 전량 매도
- 수정 — before/after 모두 있는 케이스 (수량/평단 변동)

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 단위 테스트 신규 5+ 케이스
- 수동 회귀:
  - 새 거래 생성 → 토스트 표시 → 4초 후 닫힘
  - 토스트 호버 시 일시정지
  - 거래 수정 → 토스트 표시
  - 토스트 3개 초과 시 가장 오래된 것 제거

## 제외 사항

- **DELETE 토스트** — 25-E 204 응답 형식 유지
- 배당/거래/자산 generic 성공 토스트 — 별도 phase
- 토스트 액션 버튼 (Undo 등) — 후속 phase
- 토스트 영구 표시 / 수동 닫기 X 버튼 — 자동 닫힘 + 호버 정지만으로 충분
- next-themes light 모드 토스트 색상 — `bg-bg-raised`, `border-border` CSS 변수가 자동 대응
