# [Phase 25-G-2] 면책 문구 강조 컴포넌트 통합

## 목적

세금/추정치 면책 문구가 9개 위치에서 모두 `text-[11px] text-dim` (희미한 회색 본문) 으로 페이지에 묻혀 사용자가 인지하기 어렵다. `<Disclaimer>` 단일 컴포넌트로 통일해 amber 톤 박스 + 아이콘으로 시선을 끌고, 향후 면책 톤/문구 변경 시 한 곳에서 관리.

## 배경

현재 면책 문구 사용처 (인라인 9곳):

| 파일 | 내용 |
|---|---|
| `src/app/tax/page.tsx:405` | 세금 정보는 참고용이며 법적 조언이 아닙니다. 정확한 세금 계산은 세무사에게 문의하세요. |
| `src/app/deposits/page.tsx:116` | 증여세 정보는 참고용이며 법적 조언이 아닙니다. |
| `src/app/dividends/page.tsx:140` | 배당소득세 정보는 참고용이며 법적 조언이 아닙니다. |
| `src/app/stock-options/page.tsx:102` | 세금 정보는 참고용이며 법적 조언이 아닙니다. 행사 이익만 기준 추정이며, 기존 연봉 합산 시 세율이 달라질 수 있습니다. |
| `src/app/simulator/page.tsx:84` | 시뮬레이션 결과는 가정된 수익률에 기반한 참고용이며, 실제 수익을 보장하지 않습니다. |
| `src/app/performance/page.tsx:23` | 수익률은 TWR(시간가중수익률) 기반 참고용이며, 실제 투자 성과와 다를 수 있습니다. |
| `src/components/tax/IntegratedTaxCard.tsx:205` | 인적공제·특별공제 등이 미반영된 참고용 추정치입니다. 정확한 세금 계산은 세무사에게 문의하세요. |
| `src/components/rsu/RSUDashboard.tsx:268` | RSU 근로소득세는 회사에서 원천징수됩니다. 이 계산은 참고용이며 법적 조언이 아닙니다. |
| `src/components/dividend/DividendForm.tsx:415` | 배당소득세 정보는 참고용이며 법적 조언이 아닙니다. |

## 요구사항

- [ ] `src/components/ui/Disclaimer.tsx` 신규 컴포넌트
- [ ] 9개 사용처를 `<Disclaimer>` 로 일괄 교체 (문구는 children 으로 전달)
- [ ] 페이지 레이아웃 회귀 없음
- [ ] `components.md` 의 세금 면책 룰 (`"참고용이며 법적 조언이 아닙니다"`) 그대로 유지

## 기술 설계

### 1. 컴포넌트

```tsx
// src/components/ui/Disclaimer.tsx
import { ReactNode } from 'react'

interface DisclaimerProps {
  children: ReactNode
  className?: string
}

export default function Disclaimer({ children, className = '' }: DisclaimerProps) {
  return (
    <div
      role="note"
      className={`flex gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-2.5 ${className}`}
    >
      <span aria-hidden="true" className="text-amber-400 text-[13px] leading-relaxed shrink-0">
        ⓘ
      </span>
      <p className="text-[12px] text-amber-200/90 leading-relaxed">{children}</p>
    </div>
  )
}
```

- `role="note"` — 스크린리더가 보조 정보로 인식
- amber-200 으로 가독성 확보 (디자인 시안의 amber-300/90 보다 한 톤 밝게 — dark 테마에서 충분히 보이게)
- `className` prop — 호출 측이 mt/mb 같은 spacing 만 덧붙일 수 있도록

### 2. 일괄 교체

각 사용처에서 기존 `<p>` 또는 `<div>` 를 `<Disclaimer>` 로 치환. 부모 컨테이너의 `mt-4`, `mt-6` 같은 외부 spacing 은 `className` 으로 전달.

예시 (tax/page.tsx):
```tsx
// before
<p className="text-[11px] text-dim">
  세금 정보는 참고용이며 법적 조언이 아닙니다. ...
</p>
// after
<Disclaimer>
  세금 정보는 참고용이며 법적 조언이 아닙니다. 정확한 세금 계산은 세무사에게 문의하세요.
</Disclaimer>
```

mt 가 부모에 있던 경우는 `<Disclaimer className="mt-4">` 로 전달.

### 3. IntegratedTaxCard 예외 처리

`IntegratedTaxCard.tsx:205` 는 `<span>` 안에 다른 텍스트와 함께 있어 인라인 흐름. 분리해서 별도 라인으로 두거나, 카드 내부 박스로 분리. → 별도 라인으로 `<Disclaimer>` 추가.

## 테스트 계획

- 9개 페이지/컴포넌트 모두 렌더링 확인 (lint/tsc/build)
- 시각적 회귀: 페이지 하단 면책 박스가 amber 톤으로 표시되는지
- 다크 테마에서 색상 대비 확인 (eye-check)
- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`

## 제외 사항

- 면책 문구 내용 변경 (법무 검토 영역)
- 텔레그램 봇 면책 (메시지 텍스트, 별도 phase)
- 모달/툴팁 형 강조 — 인라인 박스로 충분
- 면책 표시 토글/접기 옵션 — 작은 박스라 불필요
