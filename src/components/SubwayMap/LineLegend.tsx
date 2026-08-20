import { SUBWAY_LINES } from '../../data/lines'
import { LINE_BADGE_LABEL } from '../../data/lineBadges'

interface LineLegendProps {
  onClose: () => void
}

export function LineLegend({ onClose }: LineLegendProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/50 p-3" onClick={onClose}>
      <div
        className="max-h-[70%] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-[#0d1117] p-4 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-bold">노선 범례</span>
          <button type="button" onClick={onClose} className="text-sm text-gray-400" aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {SUBWAY_LINES.map((line) => (
            <div key={line.id} className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center whitespace-pre-line rounded-full text-center text-[9px] font-bold leading-tight"
                style={{ background: line.color, color: '#ffffff' }}
              >
                {LINE_BADGE_LABEL[line.id] ?? line.name.slice(0, 2)}
              </span>
              <span className="text-xs leading-tight text-gray-200">{line.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
