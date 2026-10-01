'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

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

const MAX_TOASTS = 3
const AUTO_DISMISS_MS = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const show = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [...prev, { ...toast, id }].slice(-MAX_TOASTS))
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
        className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-[360px] w-[calc(100vw-2rem)] pointer-events-none"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const ACCENT: Record<ToastVariant, string> = {
  success: 'border-l-emerald-500',
  error: 'border-l-red-500',
  info: 'border-l-sky-500',
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast
  onDismiss: (id: string) => void
}) {
  const [paused, setPaused] = useState(false)
  const { id } = toast

  useEffect(() => {
    if (paused) return
    const handle = setTimeout(() => onDismiss(id), AUTO_DISMISS_MS)
    return () => clearTimeout(handle)
  }, [paused, id, onDismiss])

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`pointer-events-auto bg-bg-raised border border-border ${ACCENT[toast.variant]} border-l-4 rounded-lg px-4 py-3 shadow-xl`}
    >
      <p className="text-[13px] font-semibold text-bright">{toast.title}</p>
      {toast.description && (
        <p className="text-[12px] text-sub mt-1 leading-relaxed">{toast.description}</p>
      )}
    </div>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
