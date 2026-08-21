import { useDelayNewsStore, type DelayNewsEntry } from '../store/delayNewsStore'
import { formatGameClock12h } from '../store/simulationStore'
import { formatDelayMinutes } from '../utils/time'
import { LINE_BADGE_LABEL } from '../data/lineBadges'

interface DelayNewsModalProps {
  onClose: () => void
}

function newsLine(entry: DelayNewsEntry): string {
  return `${entry.stationName}에 ${entry.reason} 발생. 열차운행 ${formatDelayMinutes(entry.durationSec)} 지연`
}

export function DelayNewsModal({ onClose }: DelayNewsModalProps) {
  const history = useDelayNewsStore((s) => s.history)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-center font-medium text-[var(--text-primary)]">지연 뉴스 이력</h2>

        <div className="flex-1 overflow-y-auto">
          {history.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--text-secondary)]">아직 발생한 지연 소식이 없습니다.</p>
          )}
          <div className="flex flex-col gap-2">
            {history.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-[var(--border)] p-2.5">
                <div className="mb-1 flex items-center gap-1.5">
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center whitespace-pre-line rounded-full text-center text-[6px] font-bold leading-none text-white"
                    style={{ background: entry.color }}
                  >
                    {LINE_BADGE_LABEL[entry.lineId] ?? ''}
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)]">{entry.lineName}</span>
                  <span className="ml-auto font-digital text-[11px] text-[var(--text-secondary)]">
                    {formatGameClock12h(entry.gameSeconds)}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-primary)]">{newsLine(entry)}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-secondary)]"
        >
          닫기
        </button>
      </div>
    </div>
  )
}
