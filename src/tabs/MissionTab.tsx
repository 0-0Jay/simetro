import { useState } from 'react'
import { useMissionStore } from '../store/missionStore'
import { useSimulationStore } from '../store/simulationStore'
import { MissionCard } from '../components/MissionCard'
import { MissionStatusPanel } from '../components/MissionStatusPanel'
import { MissionHistoryModal } from '../components/MissionHistoryModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MissionRouteStrip } from '../components/MissionRouteStrip'
import { SubwayMap, type SubwayMapRider } from '../components/SubwayMap/SubwayMap'

export function MissionTab() {
  const todayMissions = useMissionStore((s) => s.todayMissions)
  const missionHistory = useMissionStore((s) => s.missionHistory)
  const activeMission = useMissionStore((s) => s.activeMission)
  const startMission = useMissionStore((s) => s.startMission)
  const gameSeconds = useSimulationStore((s) => s.gameSeconds)
  const tracks = useSimulationStore((s) => s.tracks)

  const [pendingMissionId, setPendingMissionId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  if (activeMission) {
    const { player, mission, nextWaypointIdx } = activeMission
    const rider: SubwayMapRider = {
      mode: player.mode,
      station: player.mode === 'waiting' ? player.station : undefined,
      trainId: player.mode === 'riding' ? player.trainId : undefined,
    }
    const waypointMarkers = mission.waypoints.map((name, i) => ({
      name,
      status: (i < nextWaypointIdx ? 'done' : i === nextWaypointIdx ? 'next' : 'pending') as 'done' | 'next' | 'pending',
    }))

    return (
      <div className="flex h-full w-full flex-col">
        <div className="flex h-[55%] w-full flex-col">
          <div className="border-b border-[var(--border)] bg-[var(--bg-panel)] px-3 py-2">
            <MissionRouteStrip waypoints={mission.waypoints} nextWaypointIdx={nextWaypointIdx} tracks={tracks} />
          </div>
          <div className="min-h-0 flex-1">
            <SubwayMap rider={rider} waypointMarkers={waypointMarkers} />
          </div>
        </div>
        <div className="h-[45%] w-full">
          <MissionStatusPanel />
        </div>
      </div>
    )
  }

  const pendingMission = todayMissions.find((m) => m.id === pendingMissionId)

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {todayMissions.map((mission) => {
          const completed = missionHistory.some((r) => r.missionId === mission.id)
          return (
            <MissionCard
              key={mission.id}
              mission={mission}
              disabled={!!activeMission || completed}
              completed={completed}
              onStart={() => setPendingMissionId(mission.id)}
            />
          )
        })}
      </div>

      <div className="border-t border-[var(--border)] p-4">
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="w-full rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium text-[var(--text-primary)]"
        >
          미션 기록 내역
        </button>
      </div>

      {pendingMission && (
        <ConfirmDialog
          message="이 경로를 선택하시겠습니까?"
          onCancel={() => setPendingMissionId(null)}
          onConfirm={() => {
            startMission(pendingMission, gameSeconds)
            setPendingMissionId(null)
          }}
        />
      )}

      {historyOpen && <MissionHistoryModal onClose={() => setHistoryOpen(false)} />}
    </div>
  )
}
