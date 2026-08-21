import { create } from 'zustand'

export interface DelayNewsEntry {
  id: string
  stationName: string
  lineId: string
  lineName: string
  color: string
  reason: string
  durationSec: number
  gameSeconds: number
}

interface DelayNewsState {
  /** 최신순(0번이 가장 최근) */
  history: DelayNewsEntry[]
  lastAcceptedAtMs: number
  addEntry: (entry: Omit<DelayNewsEntry, 'id'>) => void
}

const MAX_HISTORY = 100
/** 대규모 네트워크 시뮬레이션 특성상 실제 지연 이벤트 자체는 매우 잦으므로,
 *  "뉴스"로는 실시간 기준 이 간격에 한 건만 채택한다. 나머지는 조용히 무시하며(실제 열차 시뮬레이션에는 영향 없음),
 *  헤더 티커/이력 팝업이 감당할 수 있는 속도로만 노출한다. */
const MIN_INTERVAL_MS = 20_000

export const useDelayNewsStore = create<DelayNewsState>()((set, get) => ({
  history: [],
  lastAcceptedAtMs: 0,
  addEntry: (entry) => {
    const now = Date.now()
    const { lastAcceptedAtMs, history } = get()
    if (now - lastAcceptedAtMs < MIN_INTERVAL_MS) return
    const withId: DelayNewsEntry = { ...entry, id: `${now}-${Math.random().toString(36).slice(2, 8)}` }
    set({ history: [withId, ...history].slice(0, MAX_HISTORY), lastAcceptedAtMs: now })
  },
}))
