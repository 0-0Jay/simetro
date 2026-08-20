import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { generateDailyMissions, todayKey, type Mission } from '../simulation/missionGenerator'
import { stationIndexInTrack, stationsCrossedThisTick } from '../simulation/missionPlayer'
import { trainPosition } from '../simulation/train'
import type { Track } from '../simulation/tracks'
import type { Train } from '../simulation/train'

export type ArmedBoard =
  | { trackId: string; trainId: string }
  /** trainId가 아직 없는(스폰 전) 열차를 기다리는 예약 — 종점에서 반대 방향으로 나갈 때 쓰인다. */
  | { trackId: string; trainId: null; knownTrainIds: string[] }

export type PlayerState =
  | { mode: 'waiting'; station: string; armedBoard?: ArmedBoard }
  | { mode: 'riding'; trackId: string; trainId: string; alightArmed: boolean; lastSegmentIndex: number }

export interface ActiveMission {
  mission: Mission
  player: PlayerState
  /** 다음에 반드시 거쳐야 할 mission.waypoints 인덱스 (시작 시 1 — 0번은 출발역이라 이미 도달한 것으로 취급) */
  nextWaypointIdx: number
  startedAtGameSeconds: number
  /** null이면 진행 중. 값이 있으면 그 시점에 타이머가 멈춘 것 */
  completedAtGameSeconds: number | null
}

export interface MissionRecord {
  id: string
  missionId: string
  waypoints: string[]
  difficulty: 1 | 2 | 3
  elapsedSec: number
  completedAtIso: string
}

interface MissionState {
  dateKey: string
  todayMissions: Mission[]
  missionHistory: MissionRecord[]
  activeMission: ActiveMission | null
  ensureTodayMissions: () => void
  startMission: (mission: Mission, gameSeconds: number) => void
  armBoard: (trackId: string, trainId: string) => void
  armBoardSpawn: (trackId: string, knownTrainIds: string[]) => void
  unarmBoard: () => void
  armAlight: () => void
  unarmAlight: () => void
  cancelActiveMission: () => void
  finishAndReturn: () => void
  retryMission: (record: MissionRecord, gameSeconds: number) => void
  tick: (deltaSec: number, gameSeconds: number, tracks: Track[], trainsByTrack: Record<string, Train[]>) => void
  resetAll: () => void
}

function makeRecordId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function beginMission(mission: Mission, gameSeconds: number): ActiveMission {
  return {
    mission,
    player: { mode: 'waiting', station: mission.waypoints[0] },
    nextWaypointIdx: 1,
    startedAtGameSeconds: gameSeconds,
    completedAtGameSeconds: null,
  }
}

export const useMissionStore = create<MissionState>()(
  persist(
    (set, get) => ({
      dateKey: todayKey(),
      todayMissions: generateDailyMissions(todayKey()),
      missionHistory: [],
      activeMission: null,

      ensureTodayMissions: () => {
        const key = todayKey()
        if (get().dateKey !== key) {
          set({ dateKey: key, todayMissions: generateDailyMissions(key) })
        }
      },

      startMission: (mission, gameSeconds) => {
        if (get().activeMission) return
        set({ activeMission: beginMission(mission, gameSeconds) })
      },

      armBoard: (trackId, trainId) => {
        const active = get().activeMission
        if (!active || active.player.mode !== 'waiting') return
        const already = active.player.armedBoard
        const next = already && already.trackId === trackId && already.trainId === trainId
        set({
          activeMission: {
            ...active,
            player: { ...active.player, armedBoard: next ? undefined : { trackId, trainId } },
          },
        })
      },

      armBoardSpawn: (trackId, knownTrainIds) => {
        const active = get().activeMission
        if (!active || active.player.mode !== 'waiting') return
        const already = active.player.armedBoard
        const next = already && already.trackId === trackId && already.trainId === null
        set({
          activeMission: {
            ...active,
            player: { ...active.player, armedBoard: next ? undefined : { trackId, trainId: null, knownTrainIds } },
          },
        })
      },

      unarmBoard: () => {
        const active = get().activeMission
        if (!active || active.player.mode !== 'waiting') return
        set({ activeMission: { ...active, player: { ...active.player, armedBoard: undefined } } })
      },

      armAlight: () => {
        const active = get().activeMission
        if (!active || active.player.mode !== 'riding') return
        set({ activeMission: { ...active, player: { ...active.player, alightArmed: true } } })
      },

      unarmAlight: () => {
        const active = get().activeMission
        if (!active || active.player.mode !== 'riding') return
        set({ activeMission: { ...active, player: { ...active.player, alightArmed: false } } })
      },

      cancelActiveMission: () => set({ activeMission: null }),

      finishAndReturn: () => set({ activeMission: null }),

      retryMission: (record, gameSeconds) => {
        if (get().activeMission) return
        const mission: Mission = {
          id: record.missionId,
          difficulty: record.difficulty,
          waypoints: record.waypoints,
          estimatedTotalSec: record.elapsedSec,
        }
        set({ activeMission: beginMission(mission, gameSeconds) })
      },

      tick: (_deltaSec, gameSeconds, tracks, trainsByTrack) => {
        const active = get().activeMission
        if (!active || active.completedAtGameSeconds !== null) return

        const { mission, player } = active
        let nextPlayer: PlayerState = player
        let nextWaypointIdx = active.nextWaypointIdx
        let completedNow = false

        if (player.mode === 'waiting') {
          const armed = player.armedBoard
          if (armed) {
            const track = tracks.find((t) => t.id === armed.trackId)
            if (!track) {
              nextPlayer = { ...player, armedBoard: undefined }
            } else if (armed.trainId === null) {
              // 스폰 대기: 예약 시점엔 없었던 새 열차 id가 나타나면 그게 방금 투입된 열차
              const newTrain = (trainsByTrack[track.id] ?? []).find((tr) => !armed.knownTrainIds.includes(tr.id))
              if (newTrain) {
                nextPlayer = {
                  mode: 'riding',
                  trackId: track.id,
                  trainId: newTrain.id,
                  alightArmed: false,
                  lastSegmentIndex: newTrain.segmentIndex,
                }
              }
            } else {
              const train = trainsByTrack[track.id]?.find((tr) => tr.id === armed.trainId)
              if (!train) {
                nextPlayer = { ...player, armedBoard: undefined }
              } else {
                const idx = stationIndexInTrack(track, player.station)
                const pos = idx >= 0 ? trainPosition(train, track.segmentSec) : -Infinity
                if (idx >= 0 && pos >= idx - 1e-6) {
                  nextPlayer = {
                    mode: 'riding',
                    trackId: track.id,
                    trainId: train.id,
                    alightArmed: false,
                    lastSegmentIndex: train.segmentIndex,
                  }
                }
              }
            }
          }
        } else {
          const track = tracks.find((t) => t.id === player.trackId)
          const train = track ? trainsByTrack[player.trackId]?.find((tr) => tr.id === player.trainId) : undefined

          if (!track) {
            // 이론상 발생하지 않음(트랙 목록은 고정)
          } else if (!train) {
            // 탑승 중이던 열차가 종점 도착으로 소멸 -> 종점에서 강제 하차 (경유는 "그 역에서 실제로 내렸을 때"만 인정)
            const terminusName = track.stops[track.stops.length - 1].name
            if (terminusName === mission.waypoints[nextWaypointIdx]) nextWaypointIdx++
            nextPlayer = { mode: 'waiting', station: terminusName }
            if (terminusName === mission.waypoints[mission.waypoints.length - 1] && nextWaypointIdx >= mission.waypoints.length) {
              completedNow = true
            }
          } else {
            let alightedAt: string | null = null
            if (player.alightArmed) {
              const crossed = stationsCrossedThisTick(player.lastSegmentIndex, train.segmentIndex, track)
              for (const idx of crossed) {
                const name = track.stops[idx]?.name
                if (name) { alightedAt = name; break }
              }
            }
            if (alightedAt !== null) {
              if (alightedAt === mission.waypoints[nextWaypointIdx]) nextWaypointIdx++
              nextPlayer = { mode: 'waiting', station: alightedAt }
              if (alightedAt === mission.waypoints[mission.waypoints.length - 1] && nextWaypointIdx >= mission.waypoints.length) {
                completedNow = true
              }
            } else {
              nextPlayer = { ...player, lastSegmentIndex: train.segmentIndex }
            }
          }
        }

        if (completedNow) {
          const elapsedSec = gameSeconds - active.startedAtGameSeconds
          const record: MissionRecord = {
            id: makeRecordId(),
            missionId: mission.id,
            waypoints: mission.waypoints,
            difficulty: mission.difficulty,
            elapsedSec,
            completedAtIso: new Date().toISOString(),
          }
          set((state) => ({
            activeMission: { ...active, player: nextPlayer, nextWaypointIdx, completedAtGameSeconds: gameSeconds },
            missionHistory: [...state.missionHistory, record],
          }))
        } else if (nextPlayer !== player || nextWaypointIdx !== active.nextWaypointIdx) {
          set({ activeMission: { ...active, player: nextPlayer, nextWaypointIdx } })
        }
      },

      resetAll: () => {
        const key = todayKey()
        set({ dateKey: key, todayMissions: generateDailyMissions(key), missionHistory: [], activeMission: null })
      },
    }),
    {
      name: 'simetro-missions',
      partialize: (state) => ({ dateKey: state.dateKey, missionHistory: state.missionHistory }),
      onRehydrateStorage: () => (state) => {
        state?.ensureTodayMissions()
      },
    },
  ),
)
