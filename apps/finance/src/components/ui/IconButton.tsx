'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'

type IconButtonVariant = 'default' | 'danger' | 'ghost' | 'sodam'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * 시각 스타일.
   * - default: `text-dim` → `text-text`, `bg-surface` (테이블 액션 편집 등 일반)
   * - danger:  `text-dim` → `text-red-400`, `bg-red-500/10` (삭제 등 파괴적 액션)
   * - ghost:   `text-sub` → `text-bright`, `bg-surface` (form 헤더 닫기 X)
   * - sodam:   `text-dim` → `text-sodam`, `bg-sodam/10` (예: 반복 등록 아이콘)
   */
  variant?: IconButtonVariant
}

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  default: 'text-dim hover:text-text hover:bg-surface',
  danger: 'text-dim hover:text-red-400 hover:bg-red-500/10',
  ghost: 'text-sub hover:text-bright hover:bg-surface',
  sodam: 'text-dim hover:text-sodam hover:bg-sodam/10',
}

// Codex #460 P2: `w-11 h-11` 만으로는 flex 컨테이너 안에서 축소 가능
// (다른 flex item 이 공간을 요구하면 브라우저가 44 이하로 shrink).
// `shrink-0` + `min-w-11 min-h-11` 로 실제 44×44 hitbox 계약 잠금.
// 예: CategoryTable mobile 은 4 IconButton + label 이 좁은 viewport 에서 경쟁.
const BASE_CLASSES =
  'inline-flex items-center justify-center shrink-0 w-11 h-11 min-w-11 min-h-11 rounded-md transition-all disabled:opacity-20 disabled:cursor-not-allowed'

/**
 * Phase 39-B (#451) — 44×44 hitbox 보장 아이콘 버튼.
 * WCAG 2.5.5 / Apple HIG 44×44 준수. 아이콘 시각 크기는 children svg 그대로 유지.
 * 색상 스킴은 variant 로 선택; 소수 예외 (예: `hover:text-muted`) 는 className 오버라이드.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'default', className = '', type, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
})

export default IconButton
