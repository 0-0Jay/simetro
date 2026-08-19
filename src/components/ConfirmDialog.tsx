interface ConfirmDialogProps {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] p-5 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-5 whitespace-pre-line text-[var(--text-primary)]">{message}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-[var(--border)] py-2 text-[var(--text-secondary)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg py-2 font-medium"
            style={{
              background: danger ? '#da3633' : 'var(--text-primary)',
              color: danger ? '#ffffff' : 'var(--bg)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
