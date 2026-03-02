import { create } from 'zustand'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  readonly id: string
  readonly message: string
  readonly type: ToastType
}

interface ToastState {
  readonly toasts: readonly Toast[]
  addToast: (message: string, type?: ToastType) => void
  removeToast: (id: string) => void
}

const AUTO_DISMISS_MS = 4000

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (message, type = 'info') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const toast: Toast = { id, message, type }
    set(state => ({ toasts: [...state.toasts, toast] }))
    setTimeout(() => {
      get().removeToast(id)
    }, AUTO_DISMISS_MS)
  },

  removeToast: (id) => {
    set(state => ({
      toasts: state.toasts.filter(t => t.id !== id),
    }))
  },
}))
