import { ReactNode } from 'react'

interface DisclaimerProps {
  children: ReactNode
  /** 외부 spacing (mt/mb) 전달용. 컴포넌트 자체는 외부 마진 없음. */
  className?: string
}

/**
 * 세금/추정치 면책 박스. amber 톤 + ⓘ 아이콘.
 * children 으로 블록 요소도 안전하게 받을 수 있도록 본문은 div 로 둔다.
 * light/dark 양쪽에서 충분한 대비를 갖도록 dark: prefix 로 색상 분리.
 */
export default function Disclaimer({ children, className = '' }: DisclaimerProps) {
  return (
    <div
      role="note"
      className={`flex gap-2 bg-amber-50 border border-amber-300 dark:bg-amber-500/5 dark:border-amber-500/20 rounded-lg px-4 py-2.5 ${className}`}
    >
      <span
        aria-hidden="true"
        className="text-amber-600 dark:text-amber-400 text-[13px] leading-relaxed shrink-0"
      >
        ⓘ
      </span>
      <div className="text-[12px] text-amber-800 dark:text-amber-200/90 leading-relaxed">
        {children}
      </div>
    </div>
  )
}
