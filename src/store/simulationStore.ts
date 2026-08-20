import { create } from 'zustand'
import { buildTracks, type Track } from '../simulation/tracks'
import type { Train } from '../simulation/train'
import { initializeTrainsForTrack, tickTrack, MIN_GAP_STATIONS } from '../simulation/engine'
import { mulberry32 } from '../utils/rng'

/** 게임 시각은 실시간 대비 20배속으로 흐른다(체감 1초 = 게임 20초). */
export const TIME_COMPRESSION_RATE = 20

/** 하루 운행 타임라인 (초 단위, 자정 기준). 첫차 05:30 ~ 다음날 01:00(=25:00)까지를 기본 범위로 둔다. */
export const SERVICE_START_SECONDS = 5 * 3600 + 30 * 60
export const SERVICE_END_SECONDS = 25 * 3600

/** 한 번의 rAF 프레임에서 처리할 최대 게임-초. 탭이 백그라운드에 오래 있다 돌아와도 한번에 몰아서 계산하지 않도록 상한을 둔다. */
const MAX_GAME_DELTA_SEC = 300

const TRACKS: Track[] = buildTracks()

export interface SimulationState {
  gameSeconds: number
  tracks: Track[]
  trainsByTrack: Record<string, Train[]>
  advance: (realDeltaSeconds: number) => void
}

function initializeAllTrains(rng: () => number): Record<string, Train[]> {
  const result: Record<string, Train[]> = {}
  for (const track of TRACKS) {
    const phase = Math.floor(rng() * MIN_GAP_STATIONS)
    result[track.id] = initializeTrainsForTrack(track, phase, 'init')
  }
  return result
}

export const useSimulationStore = create<SimulationState>()((set, get) => {
  const rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0)
  const spawnSeqByTrack = new Map<string, { current: number }>()
  for (const track of TRACKS) spawnSeqByTrack.set(track.id, { current: 0 })

  return {
    gameSeconds: SERVICE_START_SECONDS,
    tracks: TRACKS,
    trainsByTrack: initializeAllTrains(rng),
    advance: (realDeltaSeconds) => {
      const gameDeltaSec = Math.min(realDeltaSeconds * TIME_COMPRESSION_RATE, MAX_GAME_DELTA_SEC)
      const { gameSeconds, trainsByTrack } = get()

      const span = SERVICE_END_SECONDS - SERVICE_START_SECONDS
      const advanced = gameSeconds - SERVICE_START_SECONDS + gameDeltaSec
      const wrapped = ((advanced % span) + span) % span
      const newGameSeconds = SERVICE_START_SECONDS + wrapped

      const newTrainsByTrack: Record<string, Train[]> = {}
      for (const track of TRACKS) {
        const seqRef = spawnSeqByTrack.get(track.id)!
        newTrainsByTrack[track.id] = tickTrack(
          track,
          trainsByTrack[track.id] ?? [],
          gameDeltaSec,
          newGameSeconds,
          rng,
          'train',
          seqRef,
        )
      }

      set({ gameSeconds: newGameSeconds, trainsByTrack: newTrainsByTrack })
    },
  }
})

export function formatGameClock(gameSeconds: number): string {
  const totalSeconds = Math.floor(gameSeconds) % (24 * 3600)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
