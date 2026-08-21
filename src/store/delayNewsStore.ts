import { create } from 'zustand'
import { formatDelayMinutes } from '../utils/time'

export interface DelayNewsEntry {
  id: string
  /** 'delay': 지연 발생 소식. 'withdrawal': 그 지연이 결국 해결되지 못해 열차가 제거된 소식. */
  kind: 'delay' | 'withdrawal'
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

/** 뉴스 티커/이력 팝업에서 공통으로 쓰는 한 줄 헤드라인 문구. */
export function formatNewsLine(entry: DelayNewsEntry): string {
  if (entry.kind === 'withdrawal') {
    // "으로" 조사 하드코딩: delayEvents.ts에서 breakdownChance>0인 사유는 현재 "열차 고장"(받침 있음) 뿐이라 항상 맞는다.
    // 받침 없는 사유를 breakdownChance>0으로 추가한다면 "로"로 바뀌어야 하니 조사 처리를 다시 봐야 한다.
    return `${entry.stationName}에서 ${entry.reason}으로 운행이 중단되어 승객 전원 하차 조치되었습니다.`
  }
  return `${entry.stationName}에 ${entry.reason} 발생. 열차운행 ${formatDelayMinutes(entry.durationSec)} 지연`
}
