import { useMemo } from 'react'
import { useSimulationStore } from '../store/simulationStore'
import type { PlayerState } from '../store/missionStore'
import { directionLabelFor } from '../simulation/missionPlayer'
import { LINE_BADGE_LABEL } from '../data/lineBadges'

interface LineLabelCardProps {
  player: PlayerState
}

/** 미션 실행 화면 하단 패널에 놓이는 "지금 어느 역/노선인지" 표시. 경로 표시(MissionRouteStrip)와 같은
 * 작은 원형 배지 스타일을 써서, 하단 패널의 좁은 공간에서도 노선 정보가 줄바꿈 없이 잘 들어가게 한다. */
export function LineLabelCard({ player }: LineLabelCardProps) {
  const tracks = useSimulationStore((s) => s.tracks)

  const ridingTrack = player.mode === 'riding' ? tracks.find((t) => t.id === player.trackId) : undefined

  const stationLines = useMemo(() => {
    if (player.mode !== 'waiting') return []
    const seen = new Map<string, { id: string; color: string }>()
    for (const t of tracks) {
      if (t.stops.some((s) => s.name === player.station) && !seen.has(t.lineId)) {
        seen.set(t.lineId, { id: t.lineId, color: t.color })
      }
    }
    return [...seen.values()]
  }, [player, tracks])

  return (
    <div className="flex flex-1 flex-wrap items-center gap-1.5">
      {player.mode === 'riding' && ridingTrack ? (
        <>
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center whitespace-pre-line rounded-full text-center text-[7px] font-bold leading-none text-white"
            style={{ background: ridingTrack.color }}
          >
            {LINE_BADGE_LABEL[ridingTrack.lineId] ?? ''}
          </span>
          <span className="text-sm font-medium text-[var(--text-primary)]">{directionLabelFor(ridingTrack)}</span>
          <span className="text-xs text-[var(--text-secondary)]">탑승 중</span>
        </>
      ) : (
        <>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {player.mode === 'waiting' ? `${player.station}역에서 대기 중` : ''}
          </span>
          <div className="flex flex-wrap gap-0.5">
            {stationLines.map((l) => (
              <span
                key={l.id}
                className="flex h-5 w-5 shrink-0 items-center justify-center whitespace-pre-line rounded-full text-center text-[7px] font-bold leading-none text-white"
                style={{ background: l.color }}
              >
                {LINE_BADGE_LABEL[l.id] ?? ''}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
