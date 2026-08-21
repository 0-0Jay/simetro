import { create } from 'zustand'
import { buildTracks, type Track } from '../simulation/tracks'
import type { Train } from '../simulation/train'
import {
  initializeTrainsForTrack,
  tickTrack,
  MIN_GAP_STATIONS,
  SERVICE_START_SECONDS,
  SERVICE_END_SECONDS,
  LAST_TRAIN_CUTOFF_SECONDS,
} from '../simulation/engine'
import { mulberry32 } from '../utils/rng'
import { useDelayNewsStore } from './delayNewsStore'

/** 게임 시각은 실시간 대비 20배속으로 흐른다(체감 1초 = 게임 20초). */
export const TIME_COMPRESSION_RATE = 20

export { SERVICE_START_SECONDS, SERVICE_END_SECONDS, LAST_TRAIN_CUTOFF_SECONDS }

/** 한 번의 rAF 프레임에서 처리할 최대 게임-초. 탭이 백그라운드에 오래 있다 돌아와도 한번에 몰아서 계산하지 않도록 상한을 둔다. */
const MAX_GAME_DELTA_SEC = 300

const TRACKS: Track[] = buildTracks()

/** 지연이 결국 해결되지 못해 열차가 노선에서 제거된 사건. 발생한 그 advance() 틱에서만 유효(다음 틱엔 비워짐) —
 *  missionStore가 "내가 타고 있던 열차가 방금 고장으로 제거됐는지"를 판별하는 데 쓴다. */
export interface TrainWithdrawal {
  trackId: string
  trainId: string
  stationName: string
  reason: string
}

export interface SimulationState {
  gameSeconds: number
  tracks: Track[]
  trainsByTrack: Record<string, Train[]>
  lastWithdrawals: TrainWithdrawal[]
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
    lastWithdrawals: [],
    advance: (realDeltaSeconds) => {
      const gameDeltaSec = Math.min(realDeltaSeconds * TIME_COMPRESSION_RATE, MAX_GAME_DELTA_SEC)
      const { gameSeconds, trainsByTrack } = get()

      const span = SERVICE_END_SECONDS - SERVICE_START_SECONDS
      const advanced = gameSeconds - SERVICE_START_SECONDS + gameDeltaSec
      const wrapped = ((advanced % span) + span) % span
      const newGameSeconds = SERVICE_START_SECONDS + wrapped

      if (advanced >= span) {
        // 하루 운행이 끝나고 다음날 첫차 시간대로 넘어가는 순간: 막차 시간대에 비워졌던 노선을 전부 다시 채운다.
        set({ gameSeconds: newGameSeconds, trainsByTrack: initializeAllTrains(rng), lastWithdrawals: [] })
        return
      }

      const withdrawalsThisTick: TrainWithdrawal[] = []
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
          (event) => {
            // "뉴스"로는 사고/고장류(incident)만 다룬다 — 신호 대기/혼잡은 너무 잦아 티커에 노출하면 스팸이 된다.
            if (event.category !== 'incident') return
            useDelayNewsStore.getState().addEntry({
              kind: 'delay',
              stationName: event.stationName,
              lineId: track.lineId,
              lineName: track.lineName,
              color: track.color,
              reason: event.reason,
              durationSec: event.durationSec,
              gameSeconds: newGameSeconds,
            })
          },
          (event) => {
            withdrawalsThisTick.push({
              trackId: track.id,
              trainId: event.trainId,
              stationName: event.stationName,
              reason: event.reason,
            })
            useDelayNewsStore.getState().addEntry({
              kind: 'withdrawal',
              stationName: event.stationName,
              lineId: track.lineId,
              lineName: track.lineName,
              color: track.color,
              reason: event.reason,
              durationSec: 0,
              gameSeconds: newGameSeconds,
            })
          },
        )
      }

      set({ gameSeconds: newGameSeconds, trainsByTrack: newTrainsByTrack, lastWithdrawals: withdrawalsThisTick })
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

/** 헤더용: 게임 내 시각을 "h:mm AM/PM" 12시간제로 표시한다(날짜 없음). */
export function formatGameClock12h(gameSeconds: number): string {
  const totalSeconds = ((Math.floor(gameSeconds) % (24 * 3600)) + 24 * 3600) % (24 * 3600)
  const h24 = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const period = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`
}
