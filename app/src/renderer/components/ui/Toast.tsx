import React from 'react'
import { X, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { useToastStore } from '../../stores/toast-store'
import type { ToastType } from '../../stores/toast-store'
import { cn } from '../../lib/utils'

const TOAST_STYLES: Record<ToastType, { border: string; Icon: React.FC<{ className?: string }> }> = {
  info: { border: 'border-l-blue-500', Icon: Info },
  success: { border: 'border-l-emerald-500', Icon: CheckCircle },
  warning: { border: 'border-l-amber-500', Icon: AlertTriangle },
  error: { border: 'border-l-red-500', Icon: AlertCircle },
}

export const ToastContainer: React.FC = () => {
  const toasts = useToastStore(s => s.toasts)
  const removeToast = useToastStore(s => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map(toast => {
        const { border, Icon } = TOAST_STYLES[toast.type]
        return (
          <div
            key={toast.id}
            className={cn(
              'animate-message-in flex items-start gap-2 rounded-lg border border-l-[3px] bg-card p-3 shadow-lg',
              border,
            )}
            role="alert"
          >
            <Icon className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            <p className="flex-1 text-sm text-foreground">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
