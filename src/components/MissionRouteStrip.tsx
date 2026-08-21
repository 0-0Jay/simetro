import { LINE_BADGE_LABEL } from '../data/lineBadges'
import type { Track } from '../simulation/tracks'

interface MissionRouteStripProps {
  waypoints: string[]
  nextWaypointIdx: number
  tracks: Track[]
}

/** 출발~도착 전체 경로를 역 이름 + 그 역을 지나는 노선 배지로 보여주고, 진행 상태를 색으로 구분한다. */
export function MissionRouteStrip({ waypoints, nextWaypointIdx, tracks }: MissionRouteStripProps) {
  const linesAt = (name: string) => {
    const seen = new Map<string, { id: string; color: string }>()
    for (const t of tracks) {
      if (!seen.has(t.lineId) && t.stops.some((s) => s.name === name)) {
        seen.set(t.lineId, { id: t.lineId, color: t.color })
      }
    }
    return [...seen.values()]
  }

  return (
    <div className="flex flex-wrap items-start gap-x-1 gap-y-1.5 text-sm">
      {waypoints.map((name, i) => {
        const status = i < nextWaypointIdx ? 'done' : i === nextWaypointIdx ? 'next' : 'pending'
        return (
          <div key={i} className="flex items-start gap-1">
            {i > 0 && <span className="mt-1 text-[var(--text-secondary)]">→</span>}
            <div className="flex flex-col items-center gap-0.5">
              <span
                className={i === 0 || i === waypoints.length - 1 ? 'font-bold' : 'font-medium'}
                style={{
                  color: status === 'next' ? '#ff9500' : status === 'done' ? '#2ea043' : 'var(--text-primary)',
                }}
              >
                {name}
              </span>
              <div className="flex gap-0.5">
                {linesAt(name).map((l) => (
                  <span
                    key={l.id}
                    className="flex h-5 w-5 shrink-0 items-center justify-center whitespace-pre-line rounded-full text-center text-[7px] font-bold leading-none text-white"
                    style={{ background: l.color }}
                  >
                    {LINE_BADGE_LABEL[l.id] ?? ''}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
