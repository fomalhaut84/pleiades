# [Phase 26-B] Notice 컴포넌트 (variant 안내 박스) 통합

## 목적

5개 위치에 흩어진 yellow/amber 톤 안내 박스를 `<Notice variant>` 단일 컴포넌트로 통일. 25-G-2 의 Disclaimer (면책 전용) 와 별개로 일반 안내/경고/오류용. 향후 동일 패턴 추가 시 한 곳에서 관리.

## 배경

| 파일 | 톤 | 의미 |
|---|---|---|
| `src/components/tax/RSUTaxCard.tsx:94` | yellow | 경고 (베스팅 전 예상치) |
| `src/components/stock-option/ExerciseSimulator.tsx:123` | yellow | 경고 (행사 이익 기준 추정) |
| `src/components/stock-option/StockOptionDashboard.tsx:187` | yellow | 경고 (만료까지 N일) |
| `src/components/simulator/SimulatorSummary.tsx:125` | yellow | 경고 (증여세 한도 도달) |
| `src/components/trade/import/StepMapping.tsx:131` | amber | 오류 (필수 필드 미매핑) |

기존 4곳은 모두 `bg-yellow-500/5 border border-yellow-500/10 rounded-lg px-3 py-2` 동일 패턴. dark only — light 모드 대비 부족.

## 요구사항

- [ ] `src/components/ui/Notice.tsx` 신규 컴포넌트
  - props: `variant: 'warning' | 'error' | 'info'`, `children: ReactNode`, `className?: string`
  - variant 별 컬러 (light/dark `dark:` prefix 양쪽 대응)
  - `role="note"` (warning/info), `role="alert"` (error)
- [ ] 4 warning + 1 error 사용처 일괄 교체
- [ ] light/dark 모드 대비 충분 (WCAG AA 이상)

## 기술 설계

### 컴포넌트

```tsx
// src/components/ui/Notice.tsx
import { ReactNode } from 'react'

type Variant = 'warning' | 'error' | 'info'

interface Props {
  variant?: Variant
  children: ReactNode
  className?: string
}

const STYLES: Record<Variant, { bg: string; text: string; role: 'note' | 'alert' }> = {
  warning: {
    bg: 'bg-yellow-50 border border-yellow-300 dark:bg-yellow-500/5 dark:border-yellow-500/20',
    text: 'text-yellow-800 dark:text-yellow-200/90',
    role: 'note',
  },
  error: {
    bg: 'bg-red-50 border border-red-300 dark:bg-red-500/10 dark:border-red-500/20',
    text: 'text-red-800 dark:text-red-300',
    role: 'alert',
  },
  info: {
    bg: 'bg-sky-50 border border-sky-300 dark:bg-sky-500/5 dark:border-sky-500/20',
    text: 'text-sky-800 dark:text-sky-200/90',
    role: 'note',
  },
}

export default function Notice({ variant = 'warning', children, className = '' }: Props) {
  const s = STYLES[variant]
  return (
    <div role={s.role} className={`${s.bg} rounded-lg px-3 py-2 ${className}`}>
      <p className={`text-[11px] leading-relaxed ${s.text}`}>{children}</p>
    </div>
  )
}
```

- 본문 `<p>` 사용 (Disclaimer 는 div — children 에 블록 들어올 가능성 차이). Notice 는 인라인 텍스트만 가정.
- 외부 spacing 은 className 전달 (Disclaimer 동일 패턴)
- 아이콘 없음 (기존 4곳 디자인에 아이콘 없었고 짧은 텍스트라 시각적 노이즈 최소화)

### 적용

```tsx
// RSUTaxCard / ExerciseSimulator / StockOptionDashboard / SimulatorSummary
<Notice variant="warning">베스팅 전 예상치입니다...</Notice>

// StepMapping
<Notice variant="error" className="mt-4">필수 필드 미매핑: {fields}</Notice>
```

mt 같은 외부 spacing 만 `className` 으로 전달.

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 수동 회귀: 5 화면 모두 렌더링 + light/dark 토글
- 대비비 확인:
  - warning light: yellow-800 (#854d0e) on yellow-50 (#fefce8) ≈ 9.7:1 (WCAG AAA)
  - error light: red-800 (#991b1b) on red-50 (#fef2f2) ≈ 8.9:1 (WCAG AAA)
  - info light: sky-800 (#075985) on sky-50 (#f0f9ff) ≈ 8.8:1 (WCAG AAA)

## 제외 사항

- 아이콘 추가 — 후속 phase. 현재는 텍스트 자체로 충분
- KidsClient 의 대형 안내 영역 (p-5 text-center) — 별도 디자인이라 Notice 범위 밖
- 닫기 버튼/dismiss — 정적 안내라 불필요
- success variant — 현재 사용처 없음. 추가 시 같은 패턴
- Disclaimer 와 통합 — Disclaimer 는 면책 전용 (amber 톤 + ⓘ 아이콘 + 별도 의미). 분리 유지.
