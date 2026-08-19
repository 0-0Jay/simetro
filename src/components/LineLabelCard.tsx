import { useMemo } from 'react'
import { useSimulationStore } from '../store/simulationStore'
import type { PlayerState } from '../store/missionStore'
import { directionLabelFor } from '../simulation/missionPlayer'

interface LineLabelCardProps {
  player: PlayerState
}

/** 미션 실행 화면, 지도 바로 위에 놓이는 "지금 어느 노선인지" 라벨 카드 */
export function LineLabelCard({ player }: LineLabelCardProps) {
  const tracks = useSimulationStore((s) => s.tracks)

  const ridingTrack = player.mode === 'riding' ? tracks.find((t) => t.id === player.trackId) : undefined

  const stationLines = useMemo(() => {
    if (player.mode !== 'waiting') return []
    const seen = new Map<string, { id: string; name: string; color: string }>()
    for (const t of tracks) {
      if (t.stops.some((s) => s.name === player.station) && !seen.has(t.lineId)) {
        seen.set(t.lineId, { id: t.lineId, name: t.lineName, color: t.color })
      }
    }
    return [...seen.values()]
  }, [player, tracks])

  return (
    <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3 py-1.5">
      {player.mode === 'riding' && ridingTrack ? (
        <>
          <span
            className="rounded-md px-2.5 py-1 text-xs font-bold"
            style={{ background: ridingTrack.color, color: '#ffffff' }}
          >
            {directionLabelFor(ridingTrack)}
          </span>
          <span className="text-xs text-[var(--text-secondary)]">탑승 중</span>
        </>
      ) : (
        <>
          <span className="text-xs font-medium text-[var(--text-primary)]">
            {player.mode === 'waiting' ? `${player.station}역에서 대기 중` : ''}
          </span>
          <div className="flex flex-wrap gap-1">
            {stationLines.map((l) => (
              <span
                key={l.id}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                style={{ background: l.color, color: '#ffffff' }}
              >
                {l.name}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
