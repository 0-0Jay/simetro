import { useRealTimeClock, formatRealClock } from '../hooks/useRealTimeClock'

export function Header() {
  const now = useRealTimeClock()

  return (
    <header className="flex h-[5dvh] min-h-11 shrink-0 items-center justify-center border-b border-[var(--border)] bg-[var(--bg-panel)] pt-[env(safe-area-inset-top)]">
      <span className="font-digital text-sm text-[var(--text-primary)] sm:text-lg">{formatRealClock(now)}</span>
    </header>
  )
}
