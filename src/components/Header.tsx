import { useState } from 'react'
import { useSimulationStore, formatGameClock12h } from '../store/simulationStore'
import { useDelayNewsStore } from '../store/delayNewsStore'
import { formatDelayMinutes } from '../utils/time'
import { DelayNewsModal } from './DelayNewsModal'

export function Header() {
  const gameSeconds = useSimulationStore((s) => s.gameSeconds)
  const latestNews = useDelayNewsStore((s) => s.history[0])
  const [newsOpen, setNewsOpen] = useState(false)

  return (
    <>
      <header className="flex min-h-11 shrink-0 flex-col items-center justify-center gap-0.5 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3 pt-[env(safe-area-inset-top)] pb-1">
        <span className="font-digital text-sm text-[var(--text-primary)] sm:text-lg">{formatGameClock12h(gameSeconds)}</span>
        {latestNews && (
          <button
            type="button"
            onClick={() => setNewsOpen(true)}
            className="flex max-w-full items-center gap-1.5 text-[11px] text-[var(--text-secondary)]"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: latestNews.color }} />
            <span className="truncate">
              {latestNews.stationName}에 {latestNews.reason} 발생. 열차운행 {formatDelayMinutes(latestNews.durationSec)} 지연
            </span>
          </button>
        )}
      </header>
      {newsOpen && <DelayNewsModal onClose={() => setNewsOpen(false)} />}
    </>
  )
}
