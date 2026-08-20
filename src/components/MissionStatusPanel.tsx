import { useMissionStore, type ArmedBoard } from '../store/missionStore'
import { useSimulationStore, formatGameClock } from '../store/simulationStore'
import { getUpcomingTrains, directionLabelFor, type UpcomingTrain } from '../simulation/missionPlayer'
import { formatDuration } from '../utils/time'
import { LINE_BADGE_LABEL } from '../data/lineBadges'
import type { Track } from '../simulation/tracks'
import type { Train } from '../simulation/train'

export function MissionStatusPanel() {
  const active = useMissionStore((s) => s.activeMission)
  const cancelActiveMission = useMissionStore((s) => s.cancelActiveMission)
  const finishAndReturn = useMissionStore((s) => s.finishAndReturn)
  const armBoard = useMissionStore((s) => s.armBoard)
  const armBoardSpawn = useMissionStore((s) => s.armBoardSpawn)
  const armAlight = useMissionStore((s) => s.armAlight)
  const unarmAlight = useMissionStore((s) => s.unarmAlight)
  const gameSeconds = useSimulationStore((s) => s.gameSeconds)
  const tracks = useSimulationStore((s) => s.tracks)
  const trainsByTrack = useSimulationStore((s) => s.trainsByTrack)

  if (!active) return null
  const { mission, player } = active

  const elapsedSec =
    active.completedAtGameSeconds !== null
      ? active.completedAtGameSeconds - active.startedAtGameSeconds
      : gameSeconds - active.startedAtGameSeconds

  if (active.completedAtGameSeconds !== null) {
    return (
      <div className="flex h-full w-full flex-col justify-center gap-3 border-t border-[var(--border)] bg-[var(--bg-panel)] p-4">
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <p className="text-lg font-medium text-[var(--text-primary)]">미션 완료!</p>
          <p className="text-sm text-[var(--text-secondary)]">
            총 소요시간 {formatDuration(elapsedSec)} · 도착 시각 {formatGameClock(gameSeconds)}
          </p>
          <button
            type="button"
            onClick={finishAndReturn}
            className="rounded-lg px-5 py-2 text-sm font-medium"
            style={{ background: 'var(--text-primary)', color: 'var(--bg)' }}
          >
            확인
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col gap-2 overflow-y-auto border-t border-[var(--border)] bg-[var(--bg-panel)] p-3">
      <div className="flex items-start justify-between gap-2">
        <RouteStrip waypoints={mission.waypoints} nextWaypointIdx={active.nextWaypointIdx} tracks={tracks} />
        <div className="flex shrink-0 items-center gap-3">
          <p className="font-digital text-base text-[var(--text-primary)]">{formatDuration(elapsedSec)}</p>
          <button
            type="button"
            onClick={cancelActiveMission}
            className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-secondary)]"
          >
            미션 포기
          </button>
        </div>
      </div>

      {player.mode === 'waiting' ? (
        <WaitingPanel
          station={player.station}
          armedBoard={player.armedBoard}
          tracks={tracks}
          trainsByTrack={trainsByTrack}
          onSelect={armBoard}
          onSelectSpawn={armBoardSpawn}
        />
      ) : (
        <RidingPanel
          trackId={player.trackId}
          trainId={player.trainId}
          alightArmed={player.alightArmed}
          tracks={tracks}
          trainsByTrack={trainsByTrack}
          onArmAlight={armAlight}
          onUnarmAlight={unarmAlight}
        />
      )}
    </div>
  )
}

/** 출발~도착 전체 경로를 역 이름 + 그 역을 지나는 노선 배지로 보여주고, 진행 상태를 색으로 구분한다. */
function RouteStrip({ waypoints, nextWaypointIdx, tracks }: { waypoints: string[]; nextWaypointIdx: number; tracks: Track[] }) {
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
    <div className="flex flex-1 flex-wrap items-start gap-x-1 gap-y-1.5 text-sm">
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

function WaitingPanel({
  station,
  armedBoard,
  tracks,
  trainsByTrack,
  onSelect,
  onSelectSpawn,
}: {
  station: string
  armedBoard?: ArmedBoard
  tracks: Track[]
  trainsByTrack: Record<string, Train[]>
  onSelect: (trackId: string, trainId: string) => void
  onSelectSpawn: (trackId: string, knownTrainIds: string[]) => void
}) {
  const upcoming = getUpcomingTrains(station, tracks, trainsByTrack)

  const handleClick = (tr: UpcomingTrain) => {
    if (tr.trainId === null) {
      onSelectSpawn(tr.trackId, (trainsByTrack[tr.trackId] ?? []).map((t) => t.id))
    } else {
      onSelect(tr.trackId, tr.trainId)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
      <p className="text-xs text-[var(--text-secondary)]">다음 열차 탑승 — 목록에서 선택하세요</p>
      {upcoming.length === 0 && <p className="text-sm text-[var(--text-secondary)]">다가오는 열차 정보가 없습니다.</p>}
      {upcoming.map((tr) => {
        const isArmed = armedBoard?.trackId === tr.trackId && armedBoard?.trainId === tr.trainId
        return (
          <button
            key={`${tr.trackId}-${tr.trainId ?? 'spawn'}`}
            type="button"
            onClick={() => handleClick(tr)}
            className="flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm"
            style={{
              borderColor: isArmed ? tr.color : 'var(--border)',
              background: isArmed ? tr.color : 'transparent',
              color: isArmed ? '#ffffff' : 'var(--text-primary)',
            }}
          >
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: isArmed ? '#ffffff' : tr.color }} />
              {tr.directionLabel}
              {tr.trainId === null && <span className="text-[10px] opacity-80">(신규 투입)</span>}
            </span>
            <span className="font-digital text-xs">{isArmed ? '탑승 예약됨' : `${formatDuration(tr.etaSec)} 후 도착`}</span>
          </button>
        )
      })}
    </div>
  )
}

function RidingPanel({
  trackId,
  trainId,
  alightArmed,
  tracks,
  trainsByTrack,
  onArmAlight,
  onUnarmAlight,
}: {
  trackId: string
  trainId: string
  alightArmed: boolean
  tracks: Track[]
  trainsByTrack: Record<string, Train[]>
  onArmAlight: () => void
  onUnarmAlight: () => void
}) {
  const track = tracks.find((t) => t.id === trackId)
  const train = track ? trainsByTrack[trackId]?.find((t) => t.id === trainId) : undefined

  if (!track || !train) {
    return <p className="text-sm text-[var(--text-secondary)]">열차 정보를 불러오는 중...</p>
  }

  const segLen = track.segmentSec[train.segmentIndex] ?? 0
  const nextStation = track.stops[Math.min(train.segmentIndex + 1, track.stops.length - 1)]
  const remainingSec = Math.max(0, segLen - train.segmentElapsedSec) + train.delayRemainingSec

  return (
    <div className="flex flex-1 flex-col justify-between gap-2">
      <div>
        <p className="text-xs text-[var(--text-secondary)]">현재 탑승 중</p>
        <p className="text-base font-medium text-[var(--text-primary)]">{directionLabelFor(track)}</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          다음 역 {nextStation?.name} · {formatDuration(remainingSec)} 후 도착
        </p>
        {train.activeDelay && (
          <p className="mt-1 text-sm" style={{ color: '#ff9500' }}>
            {train.activeDelay.label} (지연 중)
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={alightArmed ? onUnarmAlight : onArmAlight}
        className="rounded-lg py-2.5 text-sm font-medium"
        style={{
          background: alightArmed ? '#ff3b30' : 'var(--text-primary)',
          color: alightArmed ? '#ffffff' : 'var(--bg)',
        }}
      >
        {alightArmed ? `${nextStation?.name} 하차 예약됨 (취소하려면 다시 탭)` : `다음역(${nextStation?.name}) 하차`}
      </button>
    </div>
  )
}
