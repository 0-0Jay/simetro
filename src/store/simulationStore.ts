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

/** 게임 시각은 실시간 대비 30배속으로 흐른다(체감 1초 = 게임 30초, 즉 게임 내 1분 = 실제 2초). */
export const TIME_COMPRESSION_RATE = 30

export { SERVICE_START_SECONDS, SERVICE_END_SECONDS, LAST_TRAIN_CUTOFF_SECONDS }

/** 한 번의 rAF 프레임에서 처리할 최대 게임-초. 탭이 백그라운드에 오래 있다 돌아와도 한번에 몰아서 계산하지 않도록 상한을 둔다. */
const MAX_GAME_DELTA_SEC = 300

const TRACKS: Track[] = buildTracks()

const SERVICE_SPAN_SECONDS = SERVICE_END_SECONDS - SERVICE_START_SECONDS

/** rawSinceStart(SERVICE_START_SECONDS 기준 경과 초, 하루 범위를 넘어도 됨)를 [SERVICE_START, SERVICE_END) 범위로 감아 넣는다. */
export function wrapGameSeconds(rawSinceStart: number): number {
  const wrapped = ((rawSinceStart % SERVICE_SPAN_SECONDS) + SERVICE_SPAN_SECONDS) % SERVICE_SPAN_SECONDS
  return SERVICE_START_SECONDS + wrapped
}

const CLOCK_STORAGE_KEY = 'simetro-clock'

interface SavedClock {
  gameSeconds: number
  savedAtMs: number
}

function loadSavedClock(): SavedClock | null {
  try {
    const raw = localStorage.getItem(CLOCK_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed.gameSeconds !== 'number' || !Number.isFinite(parsed.gameSeconds)) return null
    if (typeof parsed.savedAtMs !== 'number' || !Number.isFinite(parsed.savedAtMs)) return null
    return parsed
  } catch {
    return null
  }
}

/** 지금 게임 시각을 "이 실제 타임스탬프 기준"으로 저장해둔다. 다음 실행 시 이 값과 그때의 실제 시각 차이만큼
 *  게임 시계를 오프라인 동안에도 흐른 것으로 따라잡는 데 쓰인다. useOfflineClockPersistence가 호출한다. */
export function saveClock(gameSeconds: number): void {
  try {
    localStorage.setItem(CLOCK_STORAGE_KEY, JSON.stringify({ gameSeconds, savedAtMs: Date.now() }))
  } catch {
    // localStorage를 못 쓰는 환경(프라이빗 모드 등)이어도 게임 진행 자체엔 지장이 없어야 하므로 조용히 무시한다.
  }
}

/** 저장된 마지막 게임 시각(savedGameSeconds) + 그 시점의 실제 타임스탬프(savedAtMs)로부터, nowMs 기준
 *  실제로 흐른 시간만큼(압축 배속 없이 1:1) 게임 시각도 흘러간 것으로 계산한다. 세션 중의 압축 배속은
 *  "지켜보는 동안의 체감 속도"를 위한 것이지, 앱이 꺼져있는 동안까지 그 배속으로 흐르면 잠깐 나갔다 와도
 *  하루가 훌쩍 지나가버려 부자연스럽다 — 오프라인 동안은 1:1로 흐른 것으로 본다.
 *  순수 함수로 분리해 Date.now()/localStorage 없이 결정론적으로 테스트할 수 있게 했다. */
export function computeCatchUpGameSeconds(savedGameSeconds: number, savedAtMs: number, nowMs: number): number {
  const offlineRealSec = Math.max(0, (nowMs - savedAtMs) / 1000)
  return wrapGameSeconds(savedGameSeconds - SERVICE_START_SECONDS + offlineRealSec)
}

/** 저장된 시계가 있으면 오프라인 동안 흐른 시간을 따라잡아 앱을 새로 열었을 때의 초기 상태를 만든다.
 *  저장된 값이 없으면(최초 실행) 기존과 동일하게 첫차 시간대에 전체 편성으로 시작한다. */
function computeInitialState(rng: () => number): { gameSeconds: number; trainsByTrack: Record<string, Train[]> } {
  const saved = loadSavedClock()
  if (!saved) {
    return { gameSeconds: SERVICE_START_SECONDS, trainsByTrack: initializeAllTrains(rng) }
  }
  const newGameSeconds = computeCatchUpGameSeconds(saved.gameSeconds, saved.savedAtMs, Date.now())
  // 계산 결과가 막차 이후 심야 시간대에 걸리면 실제로도 운행 열차가 없는 게 맞다 — 빈 상태로 두면
  // WaitingPanel의 "막차가 끊긴 심야 시간대" 안내가 자연스럽게 이 상태를 설명해준다.
  const trainsByTrack = newGameSeconds >= LAST_TRAIN_CUTOFF_SECONDS ? {} : initializeAllTrains(rng)
  return { gameSeconds: newGameSeconds, trainsByTrack }
}

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
  const initial = computeInitialState(rng)

  return {
    gameSeconds: initial.gameSeconds,
    tracks: TRACKS,
    trainsByTrack: initial.trainsByTrack,
    lastWithdrawals: [],
    advance: (realDeltaSeconds) => {
      const gameDeltaSec = Math.min(realDeltaSeconds * TIME_COMPRESSION_RATE, MAX_GAME_DELTA_SEC)
      const { gameSeconds, trainsByTrack } = get()

      const advanced = gameSeconds - SERVICE_START_SECONDS + gameDeltaSec
      const newGameSeconds = wrapGameSeconds(advanced)

      if (advanced >= SERVICE_SPAN_SECONDS) {
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
