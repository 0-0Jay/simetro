import { useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { ColorPickerModal } from '../components/ColorPickerModal'
import { ConfirmDialog } from '../components/ConfirmDialog'

export function SettingsTab() {
  const themeColor = useSettingsStore((s) => s.themeColor)
  const setThemeColor = useSettingsStore((s) => s.setThemeColor)
  const soundEnabled = useSettingsStore((s) => s.soundEnabled)
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled)
  const resetAll = useSettingsStore((s) => s.resetAll)

  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  return (
    <div className="flex h-full w-full flex-col gap-3 p-4">
      <button
        type="button"
        onClick={() => setShowColorPicker(true)}
        className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-4 text-left"
      >
        <span>화면색 설정</span>
        <span className="h-5 w-5 rounded-full border border-[var(--border)]" style={{ background: themeColor }} />
      </button>

      <button
        type="button"
        onClick={() => setSoundEnabled(!soundEnabled)}
        className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-4 text-left"
      >
        <span>효과음·진동</span>
        <span
          className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
          style={{ background: soundEnabled ? 'var(--text-primary)' : 'var(--border)' }}
        >
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full bg-[var(--bg)] transition-transform"
            style={{ transform: soundEnabled ? 'translateX(22px)' : 'translateX(2px)' }}
          />
        </span>
      </button>

      <button
        type="button"
        onClick={() => setShowResetConfirm(true)}
        className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-4 text-left text-red-400"
      >
        <span>초기화</span>
        <span>›</span>
      </button>

      {showColorPicker && (
        <ColorPickerModal
          initialColor={themeColor}
          onClose={() => setShowColorPicker(false)}
          onApply={(hex) => {
            setThemeColor(hex)
            setShowColorPicker(false)
          }}
        />
      )}

      {showResetConfirm && (
        <ConfirmDialog
          message={'정말로 모든 기록을\n초기화하시겠습니까?'}
          danger
          confirmLabel="초기화"
          onCancel={() => setShowResetConfirm(false)}
          onConfirm={() => {
            resetAll()
            setShowResetConfirm(false)
          }}
        />
      )}
    </div>
  )
}
