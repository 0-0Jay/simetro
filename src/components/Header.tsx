import { useState } from 'react'
import { useSimulationStore, formatGameClock12h } from '../store/simulationStore'
import { useDelayNewsStore, formatNewsLine } from '../store/delayNewsStore'
import { DelayNewsModal } from './DelayNewsModal'

export function Header() {
  const gameSeconds = useSimulationStore((s) => s.gameSeconds)
  const latestNews = useDelayNewsStore((s) => s.history[0])
  const [newsOpen, setNewsOpen] = useState(false)

  return (
    <>
      <header className="flex min-h-11 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3 pt-[env(safe-area-inset-top)] pb-1">
        <span className="font-digital shrink-0 text-lg font-bold text-[var(--text-primary)] sm:text-xl">
          {formatGameClock12h(gameSeconds)}
        </span>
        {latestNews && (
          <button
            type="button"
            onClick={() => setNewsOpen(true)}
            className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-[11px] text-[var(--text-secondary)]"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: latestNews.color }} />
            <span className="truncate">{formatNewsLine(latestNews)}</span>
          </button>
        )}
      </header>
      {newsOpen && <DelayNewsModal onClose={() => setNewsOpen(false)} />}
    </>
  )
}
