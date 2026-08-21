import { useEffect, useRef } from 'react'
import { useMissionStore, type ArmedBoard } from '../store/missionStore'
import { useSimulationStore, formatGameClock, LAST_TRAIN_CUTOFF_SECONDS } from '../store/simulationStore'
import { useSettingsStore } from '../store/settingsStore'
import { getUpcomingTrains, directionLabelFor, isBlockedByAhead, type UpcomingTrain } from '../simulation/missionPlayer'
import { formatDuration } from '../utils/time'
import { playBoardSound, playAlightSound, playCompleteSound, playDelaySound } from '../utils/sound'
import { LineLabelCard } from './LineLabelCard'
import type { Track } from '../simulation/tracks'
import type { Train } from '../simulation/train'
import { effectiveSegmentSec } from '../simulation/train'

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
  const soundEnabled = useSettingsStore((s) => s.soundEnabled)

  const prevModeRef = useRef<'waiting' | 'riding' | null>(null)
  const prevCompletedRef = useRef<number | null>(null)
  const prevDelayRef = useRef(false)

  // 탑승/하차/완료/지연 발생 시점을 감지해 짧은 효과음·진동을 울린다(상태 전이 감지이므로 useEffect에서 처리).
  useEffect(() => {
    if (!active) {
      prevModeRef.current = null
      prevCompletedRef.current = null
      prevDelayRef.current = false
      return
    }
    const { player, completedAtGameSeconds } = active

    if (soundEnabled) {
      if (prevCompletedRef.current === null && completedAtGameSeconds !== null) {
        playCompleteSound()
      } else if (prevModeRef.current === 'waiting' && player.mode === 'riding') {
        playBoardSound()
      } else if (prevModeRef.current === 'riding' && player.mode === 'waiting') {
        playAlightSound()
      }
    }

    if (player.mode === 'riding') {
      const track = tracks.find((t) => t.id === player.trackId)
      const train = track ? trainsByTrack[player.trackId]?.find((t) => t.id === player.trainId) : undefined
      const hasDelay = !!train?.activeDelay
      if (soundEnabled && hasDelay && !prevDelayRef.current) playDelaySound()
      prevDelayRef.current = hasDelay
    } else {
      prevDelayRef.current = false
    }

    prevModeRef.current = player.mode
    prevCompletedRef.current = completedAtGameSeconds
  }, [active, soundEnabled, tracks, trainsByTrack])

  if (!active) return null
  const { player } = active

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
        <LineLabelCard player={player} />
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
          forcedOffReason={player.forcedOffReason}
          tracks={tracks}
          trainsByTrack={trainsByTrack}
          gameSeconds={gameSeconds}
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

function WaitingPanel({
  station,
  armedBoard,
  forcedOffReason,
  tracks,
  trainsByTrack,
  gameSeconds,
  onSelect,
  onSelectSpawn,
}: {
  station: string
  armedBoard?: ArmedBoard
  forcedOffReason?: string
  tracks: Track[]
  trainsByTrack: Record<string, Train[]>
  gameSeconds: number
  onSelect: (trackId: string, trainId: string) => void
  onSelectSpawn: (trackId: string, knownTrainIds: string[]) => void
}) {
  const upcoming = getUpcomingTrains(station, tracks, trainsByTrack)
  const isOvernight = gameSeconds >= LAST_TRAIN_CUTOFF_SECONDS

  const handleClick = (tr: UpcomingTrain) => {
    if (tr.trainId === null) {
      onSelectSpawn(tr.trackId, (trainsByTrack[tr.trackId] ?? []).map((t) => t.id))
    } else {
      onSelect(tr.trackId, tr.trainId)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
      {forcedOffReason && (
        // "으로" 하드코딩: 강제 하차를 유발하는 사유는 현재 delayEvents.ts의 "열차 고장"(받침 있음) 뿐이라 항상 맞는다.
        <p className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#ff3b30', color: '#ff3b30' }}>
          🚨 {forcedOffReason}으로 열차 운행이 중단되어 {station}에서 하차 조치되었습니다.
        </p>
      )}
      <p className="text-xs text-[var(--text-secondary)]">다음 열차 탑승 — 목록에서 선택하세요</p>
      {upcoming.length === 0 && isOvernight && (
        <p className="text-sm" style={{ color: '#ff9500' }}>
          막차가 끊긴 심야 시간대입니다 — 첫차(05:30)까지 운행하는 열차가 없어요.
        </p>
      )}
      {upcoming.length === 0 && !isOvernight && <p className="text-sm text-[var(--text-secondary)]">다가오는 열차 정보가 없습니다.</p>}
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
              {tr.isExpress && (
                <span
                  className="rounded px-1 text-[10px] font-bold"
                  style={{ background: isArmed ? '#ffffff' : '#ffd700', color: '#1a1a1a' }}
                >
                  급행
                </span>
              )}
              {tr.directionLabel}
              {tr.trainId === null && <span className="text-[10px] opacity-80">(신규 투입)</span>}
              {tr.blocked && <span className="text-[10px] opacity-80">(정체 — 지연될 수 있음)</span>}
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

  const segmentSec = effectiveSegmentSec(track, train)
  const segLen = segmentSec[train.segmentIndex] ?? 0
  const nextStation = track.stops[Math.min(train.segmentIndex + 1, track.stops.length - 1)]
  const remainingSec = Math.max(0, segLen - train.segmentElapsedSec) + train.delayRemainingSec + (train.yieldRemainingSec ?? 0)
  const isExpress = train.trainClass === 'express'
  const isYielding = (train.yieldRemainingSec ?? 0) > 0
  // 자기 자신의 지연은 없지만 앞차와의 최소 간격 제한에 막혀 사실상 못 움직이는 상태 — 이 경우 위 remainingSec은
  // "막힘이 안 풀렸을 때"를 가정한 부정확한(멈춰있는 것처럼 보이는) 값이라 그대로 보여주지 않는다.
  const blocked = !train.activeDelay && !isYielding && isBlockedByAhead(train, trainsByTrack[trackId] ?? [], track)

  return (
    <div className="flex flex-1 flex-col justify-between gap-2">
      <div>
        <p className="text-xs text-[var(--text-secondary)]">현재 탑승 중</p>
        <p className="text-base font-medium text-[var(--text-primary)]">
          {isExpress && (
            <span className="mr-1.5 rounded px-1 text-xs font-bold" style={{ background: '#ffd700', color: '#1a1a1a' }}>
              급행
            </span>
          )}
          {directionLabelFor(track)}
        </p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          다음 역 {nextStation?.name} · {blocked ? '앞차 통행 대기 중' : isYielding ? '급행 통과 대기 중' : `${formatDuration(remainingSec)} 후 도착`}
        </p>
        {train.activeDelay && (
          <p className="mt-1 text-sm" style={{ color: '#ff9500' }}>
            {train.activeDelay.label} (지연 중)
          </p>
        )}
        {isYielding && (
          <p className="mt-1 text-sm" style={{ color: '#5ac8fa' }}>
            대피역에서 급행 열차가 먼저 지나가길 기다리는 중입니다
          </p>
        )}
        {blocked && (
          <p className="mt-1 text-sm" style={{ color: '#5ac8fa' }}>
            혼잡으로 앞차 뒤에서 서행 중 — 앞차가 빠지면 곧 다시 출발합니다
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
