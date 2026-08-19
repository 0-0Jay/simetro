import type { DelayCategory } from './delayEvents'

export interface Train {
  id: string
  trackId: string
  /** 현재 진행 중인 구간 index (stops[segmentIndex] -> stops[segmentIndex+1]) */
  segmentIndex: number
  /** 현재 구간에서 경과한 시간(초) */
  segmentElapsedSec: number
  /** 지연으로 인해 더 대기해야 하는 남은 시간(초). 0이면 지연 없음 */
  delayRemainingSec: number
  activeDelay?: { category: DelayCategory; label: string }
}

/** 연속적인 위치(정거장 단위). 정수면 역에 정확히 있는 상태, 소수면 구간 이동 중. */
export function trainPosition(train: Train, segmentSec: number[]): number {
  const segLen = segmentSec[train.segmentIndex]
  if (!segLen) return train.segmentIndex
  return train.segmentIndex + train.segmentElapsedSec / segLen
}
