import type { DelayCategory } from './delayEvents'
import type { Track } from './tracks'

export interface Train {
  id: string
  trackId: string
  /** 현재 진행 중인 구간 index (stops[segmentIndex] -> stops[segmentIndex+1]) */
  segmentIndex: number
  /** 현재 구간에서 경과한 시간(초) */
  segmentElapsedSec: number
  /** 지연으로 인해 더 대기해야 하는 남은 시간(초). 0이면 지연 없음 */
  delayRemainingSec: number
  activeDelay?: {
    category: DelayCategory
    label: string
    reason: string
    /** true면 이 지연이 끝나는 시점에 정상 재개하지 못하고 열차가 고장 판정을 받아 노선에서 제거된다. */
    willBreakdown: boolean
  }
  /** 급행 열차면 'express'. 없으면(대부분) 완행이다. */
  trainClass?: 'express'
  /** 완행이 급행에게 순서를 양보하려고 대피역에서 대기 중인 남은 시간(초). delayRemainingSec(지연)과는
   *  별개의 정상 운행 절차라 UI에 "지연"으로는 표시하지 않는다. 0/undefined면 대기 없음. */
  yieldRemainingSec?: number
}

/** 이 열차 기준으로 실제 적용할 구간별 소요시간 배열을 고른다 — 급행이 통과역에서 시간을 단축하는 걸
 *  반영한 트랙의 expressSegmentSec가 있으면 그걸, 아니면(완행이거나 급행 노선이 아니면) 일반 segmentSec를 쓴다. */
export function effectiveSegmentSec(track: Track, train: Train): number[] {
  if (train.trainClass === 'express' && track.expressSegmentSec) return track.expressSegmentSec
  return track.segmentSec
}

/** 연속적인 위치(정거장 단위). 정수면 역에 정확히 있는 상태, 소수면 구간 이동 중. */
export function trainPosition(train: Train, segmentSec: number[]): number {
  const segLen = segmentSec[train.segmentIndex]
  if (!segLen) return train.segmentIndex
  return train.segmentIndex + train.segmentElapsedSec / segLen
}
