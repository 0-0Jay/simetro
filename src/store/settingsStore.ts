import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { deriveThemePalette } from '../utils/color'

interface SettingsState {
  themeColor: string
  soundEnabled: boolean
  setThemeColor: (hex: string) => void
  setSoundEnabled: (enabled: boolean) => void
  resetAll: () => void
}

const DEFAULT_THEME_COLOR = '#ffffff'

function applyThemeToDocument(hex: string) {
  const root = document.documentElement
  const palette = deriveThemePalette(hex)
  root.style.setProperty('--theme-color', hex)
  root.style.setProperty('--theme-text', palette.textPrimary)
  root.style.setProperty('--bg', palette.bg)
  root.style.setProperty('--bg-panel', palette.bgPanel)
  root.style.setProperty('--border', palette.border)
  root.style.setProperty('--text-primary', palette.textPrimary)
  root.style.setProperty('--text-secondary', palette.textSecondary)
  root.style.colorScheme = palette.textPrimary === '#ffffff' ? 'dark' : 'light'
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeColor: DEFAULT_THEME_COLOR,
      soundEnabled: true,
      setThemeColor: (hex) => {
        applyThemeToDocument(hex)
        set({ themeColor: hex })
      },
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      resetAll: () => {
        localStorage.clear()
        // 모든 스토어(미션 기록 등)를 확실히 초기 상태로 되돌리기 위해 새로고침한다.
        window.location.reload()
      },
    }),
    {
      name: 'simetro-settings',
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeToDocument(state.themeColor)
      },
    },
  ),
)
