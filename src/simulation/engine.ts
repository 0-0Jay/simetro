import type { Track } from './tracks'
import type { Train } from './train'
import { trainPosition, effectiveSegmentSec } from './train'
import { rollDelay, type DelayCategory } from './delayEvents'

/** 역 도착 시 지연이 새로 발생할 때마다 호출되는 콜백 정보 (뉴스 티커 등 표시용). */
export interface DelayRollEvent {
  stationName: string
  category: DelayCategory
  reason: string
  durationSec: number
}

/** 지연이 "결국 해결되지 못해" 열차가 노선에서 제거될 때 호출되는 콜백 정보. */
export interface WithdrawEvent {
  trainId: string
  stationName: string
  label: string
  reason: string
}

/** 열차 사이에 반드시 1개 역이 있어야 하므로, station-index 기준 최소 간격은 2 (역[열차]--역--역[열차]) */
export const MIN_GAP_STATIONS = 2
const EPS = 1e-6

/** 급행이 통과역 하나를 건너뛸 때마다 아낀 것으로 치는 시간(초) — 실제 정차에 드는 감속·정차·가속 시간의 근사치. */
export const EXPRESS_DWELL_BONUS_SEC = 40
/** 통과역 구간이 아무리 짧아도 이 값보다 짧아지진 않는다(극단적으로 짧은 구간에서 음수/0에 가까워지는 것 방지). */
export const MIN_EXPRESS_SEGMENT_SEC = 20
/** 완행이 대피역에서 급행에게 순서를 양보하기 위해 대기하는 시간(초) — 실제 시간표상 예정된 대기이지 "지연"이 아니다.
 *  급행이 최소 간격(MIN_GAP_STATIONS)만큼 뒤에 바짝 붙어 대기하고 있던 최악의 경우에도, 그 간격을 다 좁히고
 *  확실히 앞으로 나설 수 있을 만큼 넉넉해야 한다 — 너무 짧으면 완행이 다시 출발해버려 영영 못 앞지르게 된다. */
export const YIELD_HOLD_SEC = 150
/** 초기 배치/신규 투입 시 몇 번째 열차마다 급행으로 배정할지(급행 노선에 한해). */
const EXPRESS_EVERY_N = 3

/** 하루 운행 타임라인 (초 단위, 자정 기준). 첫차 05:30 ~ 다음날 01:00(=25:00)까지를 기본 범위로 둔다. */
export const SERVICE_START_SECONDS = 5 * 3600 + 30 * 60
export const SERVICE_END_SECONDS = 25 * 3600
/** 막차 정책: 이 시각(자정) 이후로는 신규 열차를 투입하지 않는다. 이미 달리던 열차는 하던 구간/바퀴를 마저 마치고 소멸한다. */
export const LAST_TRAIN_CUTOFF_SECONDS = SERVICE_END_SECONDS - 3600

/** 트랙 전체(처음~끝)를 3정거장 간격으로 가득 채워 초기 배치한다. phase(0~2)만 랜덤. 급행 노선이면 매 EXPRESS_EVERY_N번째를 급행으로 배정한다. */
export function initializeTrainsForTrack(track: Track, phase: number, idPrefix: string): Train[] {
  const lastIndex = track.stops.length - 1
  const trains: Train[] = []
  let position = phase
  let seq = 0
  while (position < lastIndex) {
    const isExpress = !!track.expressStopIndices && seq % EXPRESS_EVERY_N === 0
    trains.push({
      id: `${idPrefix}-${track.id}-${seq++}`,
      trackId: track.id,
      segmentIndex: position,
      segmentElapsedSec: 0,
      delayRemainingSec: 0,
      ...(isExpress ? { trainClass: 'express' as const } : {}),
    })
    position += MIN_GAP_STATIONS
  }
  // 순환선은 소멸·재투입이 없어 열차 수가 평생 고정된다. 위 로직대로 끝까지 꽉 채우면 이음매(마지막 열차 ->
  // 첫 열차, 한 바퀴 건너) 간격이 MIN_GAP_STATIONS 미만이 될 수 있는데, tickTrack이 이 이음매 간격도
  // 지키도록 강제하기 때문에(맨 앞차도 맨 뒤차를 앞차로 간주) 슬랙이 0이면 전체가 처음부터 못 움직이고
  // 얼어붙는다. 마지막 한 대를 빼서 이음매 쪽에 항상 MIN_GAP_STATIONS보다 넉넉한 여유를 만들어 둔다.
  if (track.isLoop && trains.length > 1) {
    trains.pop()
  }
  return trains
}

/** result(이미 처리된, 앞쪽부터 순서대로의 열차들) 중에서 train 바로 앞의 "실질적인" 막는 열차 위치를 찾는다.
 *  급행 입장에서는, 대피역에서 순서를 양보 중인(yieldRemainingSec>0) 완행은 건너뛰고 그 너머를 본다 —
 *  이게 바로 급행이 완행을 추월하는 지점이다. 아무도 안 걸리면(맨 앞이면) loopWrapAheadPos를 쓴다. */
function findAheadPos(result: Train[], train: Train, track: Track, loopWrapAheadPos: number): number {
  const isExpress = train.trainClass === 'express'
  for (let i = result.length - 1; i >= 0; i--) {
    const candidate = result[i]
    if (isExpress && candidate.trainClass !== 'express' && (candidate.yieldRemainingSec ?? 0) > 0) {
      continue // 대피 중인 완행 -> 급행은 이 열차를 무시하고 더 앞을 본다(추월 허용)
    }
    return trainPosition(candidate, effectiveSegmentSec(track, candidate))
  }
  return loopWrapAheadPos
}

/**
 * 한 트랙의 열차들을 deltaSec(게임 초)만큼 전진시키고, 필요하면 기점에 새 열차를 투입한다.
 * 선두(종점에 가장 가까운) 열차부터 순서대로 처리하여, 뒤 열차가 앞 열차와의 3역 간격을 넘어서지 못하게 한다.
 * 급행 열차는 통과역에서 시간을 단축하고(effectiveSegmentSec), 대피역에서 순서를 양보 중인 완행을 추월할 수 있다.
 */
export function tickTrack(
  track: Track,
  trains: Train[],
  deltaSec: number,
  gameSeconds: number,
  rng: () => number,
  spawnIdPrefix: string,
  spawnSeqRef: { current: number },
  onDelay?: (event: DelayRollEvent) => void,
  onWithdraw?: (event: WithdrawEvent) => void,
): Train[] {
  if (track.segmentSec.length === 0) return trains

  const sorted = [...trains].sort(
    (a, b) =>
      trainPosition(b, effectiveSegmentSec(track, b)) - trainPosition(a, effectiveSegmentSec(track, a)),
  )

  const result: Train[] = []
  // 순환선은 "맨 앞차"도 원 위에서는 "맨 뒤차"(이음매 건너편)를 쫓고 있는 것과 같다. 맨 뒤차 위치에
  // 한 바퀴(segmentSec.length)를 더한 값을 가상의 "이음매 건너 앞차"로 취급해 최소 간격을 강제한다.
  // initializeTrainsForTrack이 순환선에서 항상 이음매 슬랙을 남겨두므로(열차 한 대를 덜 투입), 이 제약이
  // 시작부터 전체를 얼어붙게 만들 일은 없다. (현재 급행 노선은 순환선이 아니라 이 둘은 서로 얽히지 않는다.)
  const loopWrapAheadPos =
    track.isLoop && sorted.length > 1
      ? trainPosition(sorted[sorted.length - 1], effectiveSegmentSec(track, sorted[sorted.length - 1])) +
        track.segmentSec.length
      : Number.POSITIVE_INFINITY

  for (const original of sorted) {
    const train: Train = { ...original }
    const isExpress = train.trainClass === 'express'
    const effSeg = effectiveSegmentSec(track, train)
    const aheadPos = findAheadPos(result, train, track, loopWrapAheadPos)
    const maxAllowedPos = aheadPos - MIN_GAP_STATIONS
    let remaining = deltaSec
    let arrivedTerminus = false

    while (remaining > EPS && !arrivedTerminus) {
      if (train.delayRemainingSec > 0) {
        const consumed = Math.min(remaining, train.delayRemainingSec)
        train.delayRemainingSec -= consumed
        remaining -= consumed
        if (train.delayRemainingSec <= EPS) {
          train.delayRemainingSec = 0
          const resolvedDelay = train.activeDelay
          train.activeDelay = undefined
          if (resolvedDelay?.willBreakdown) {
            // 지연이 끝나는 시점에 결국 수리/해결에 실패 -> 지금 있는 역에서 승객을 전원 하차시키고 열차를 제거한다.
            onWithdraw?.({
              trainId: train.id,
              stationName: track.stops[train.segmentIndex].name,
              label: resolvedDelay.label,
              reason: resolvedDelay.reason,
            })
            arrivedTerminus = true
            break
          }
        }
        continue
      }

      if ((train.yieldRemainingSec ?? 0) > 0) {
        const consumed = Math.min(remaining, train.yieldRemainingSec!)
        train.yieldRemainingSec = train.yieldRemainingSec! - consumed
        remaining -= consumed
        if (train.yieldRemainingSec <= EPS) train.yieldRemainingSec = 0
        continue
      }

      const segCount = track.segmentSec.length
      const segLen = track.isLoop ? effSeg[train.segmentIndex % segCount] : effSeg[train.segmentIndex]
      if (segLen === undefined) {
        arrivedTerminus = true
        break
      }
      const currentPos = train.segmentIndex + train.segmentElapsedSec / segLen
      const posCapThisSegment = Math.min(train.segmentIndex + 1, maxAllowedPos)
      if (posCapThisSegment <= currentPos + EPS) {
        // 앞차와의 간격 제한에 막혀 더 못 감
        break
      }
      const maxElapsedThisSeg = (posCapThisSegment - train.segmentIndex) * segLen
      const neededToArriveSec = segLen - train.segmentElapsedSec
      const step = Math.min(remaining, neededToArriveSec, maxElapsedThisSeg - train.segmentElapsedSec)
      if (step <= EPS) break

      train.segmentElapsedSec += step
      remaining -= step

      if (train.segmentElapsedSec >= segLen - EPS) {
        train.segmentIndex += 1
        train.segmentElapsedSec = 0
        if (train.segmentIndex >= segCount) {
          if (track.isLoop) {
            if (gameSeconds >= LAST_TRAIN_CUTOFF_SECONDS) {
              // 막차 시간대: 순환선도 지금 돌고 있던 바퀴를 마치는 시점에 소멸시켜 서서히 운행을 종료한다.
              arrivedTerminus = true
              break
            }
            // 순환선: 소멸시키지 않고 한 바퀴를 돌아 다시 처음(0)부터 이어간다 (같은 열차가 계속 순환).
            train.segmentIndex -= segCount
          } else {
            arrivedTerminus = true
            break
          }
        }
        // 완행이 대피역(급행에게 순서를 양보할 수 있는 역)에 도착하면, 예정대로 잠시 대기한다.
        if (!isExpress && track.passingStationIndices?.has(train.segmentIndex)) {
          train.yieldRemainingSec = YIELD_HOLD_SEC
        }
        const rolled = rollDelay(gameSeconds, rng)
        if (rolled) {
          train.delayRemainingSec = rolled.durationSec
          train.activeDelay = {
            category: rolled.category,
            label: rolled.label,
            reason: rolled.reason,
            willBreakdown: rolled.willBreakdown,
          }
          onDelay?.({
            stationName: track.stops[train.segmentIndex].name,
            category: rolled.category,
            reason: rolled.reason,
            durationSec: rolled.durationSec,
          })
        }
      }
    }

    if (arrivedTerminus) {
      // 종점 도착 -> 소멸 (aheadPos는 갱신하지 않음: 이 열차는 더 이상 존재하지 않으므로 뒤 열차 입장에서 그 다음으로 앞선 열차 기준을 따라야 하나,
      // 이미 aheadPos가 이전 루프의 값(더 앞섰던 열차 또는 Infinity)로 남아있어 안전측으로 동작한다.
      continue
    }

    result.push(train)
  }

  // 순환선은 소멸이 없으므로 별도 투입이 필요 없다. 종점이 있는 노선만 기점에 새 열차를 투입한다.
  // 막차 시간대(자정 이후)엔 신규 투입을 멈춘다 — 이미 달리는 열차만 마저 운행하고 서서히 빈다.
  if (!track.isLoop && gameSeconds < LAST_TRAIN_CUTOFF_SECONDS) {
    const rearmostPos =
      result.length > 0 ? Math.min(...result.map((t) => trainPosition(t, effectiveSegmentSec(track, t)))) : Infinity
    if (result.length === 0 || rearmostPos >= MIN_GAP_STATIONS - EPS) {
      const seq = spawnSeqRef.current++
      const isExpress = !!track.expressStopIndices && seq % EXPRESS_EVERY_N === 0
      result.push({
        id: `${spawnIdPrefix}-${track.id}-${seq}`,
        trackId: track.id,
        segmentIndex: 0,
        segmentElapsedSec: 0,
        delayRemainingSec: 0,
        ...(isExpress ? { trainClass: 'express' as const } : {}),
      })
    }
  }

  return result
}
