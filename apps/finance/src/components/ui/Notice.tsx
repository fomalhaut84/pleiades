import { ReactNode } from 'react'

type Variant = 'warning' | 'error' | 'info'

interface Props {
  variant?: Variant
  children: ReactNode
  /** 외부 spacing (mt/mb) 전달용. 컴포넌트 자체는 외부 마진 없음. */
  className?: string
}

const STYLES: Record<
  Variant,
  { container: string; text: string; role: 'note' | 'alert' }
> = {
  warning: {
    container:
      'bg-yellow-50 border border-yellow-300 dark:bg-yellow-500/5 dark:border-yellow-500/20',
    text: 'text-yellow-800 dark:text-yellow-200/90',
    role: 'note',
  },
  error: {
    container:
      'bg-red-50 border border-red-300 dark:bg-red-500/10 dark:border-red-500/20',
    text: 'text-red-800 dark:text-red-300',
    role: 'alert',
  },
  info: {
    container:
      'bg-sky-50 border border-sky-300 dark:bg-sky-500/5 dark:border-sky-500/20',
    text: 'text-sky-800 dark:text-sky-200/90',
    role: 'note',
  },
}

/**
 * 일반 안내/경고/오류 박스. light/dark 양쪽 충분한 대비 보장.
 * 면책 전용 박스는 별도의 <Disclaimer> 사용.
 */
export default function Notice({
  variant = 'warning',
  children,
  className = '',
}: Props) {
  const s = STYLES[variant]
  return (
    <div role={s.role} className={`${s.container} rounded-lg px-3 py-2 ${className}`}>
      <p className={`text-[11px] leading-relaxed ${s.text}`}>{children}</p>
    </div>
  )
}
