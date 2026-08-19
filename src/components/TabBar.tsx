export type TabId = 'home' | 'mission' | 'settings'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'home', label: '홈', icon: '🚇' },
  { id: 'mission', label: '미션', icon: '🎯' },
  { id: 'settings', label: '설정', icon: '⚙️' },
]

interface TabBarProps {
  active: TabId
  onChange: (tab: TabId) => void
}

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav className="flex h-[5dvh] min-h-14 shrink-0 border-t border-[var(--border)] bg-[var(--bg-panel)] pb-[env(safe-area-inset-bottom)]">
      {TABS.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors"
            style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            <span className="text-base leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
