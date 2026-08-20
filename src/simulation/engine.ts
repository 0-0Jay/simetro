import type { Track } from './tracks'
import type { Train } from './train'
import { trainPosition } from './train'
import { rollDelay } from './delayEvents'

/** 열차 사이에 반드시 1개 역이 있어야 하므로, station-index 기준 최소 간격은 2 (역[열차]--역--역[열차]) */
export const MIN_GAP_STATIONS = 2
const EPS = 1e-6

/** 트랙 전체(처음~끝)를 3정거장 간격으로 가득 채워 초기 배치한다. phase(0~2)만 랜덤. */
export function initializeTrainsForTrack(track: Track, phase: number, idPrefix: string): Train[] {
  const lastIndex = track.stops.length - 1
  const trains: Train[] = []
  let position = phase
  let seq = 0
  while (position < lastIndex) {
    trains.push({
      id: `${idPrefix}-${track.id}-${seq++}`,
      trackId: track.id,
      segmentIndex: position,
      segmentElapsedSec: 0,
      delayRemainingSec: 0,
    })
    position += MIN_GAP_STATIONS
  }
  return trains
}

/**
 * 한 트랙의 열차들을 deltaSec(게임 초)만큼 전진시키고, 필요하면 기점에 새 열차를 투입한다.
 * 선두(종점에 가장 가까운) 열차부터 순서대로 처리하여, 뒤 열차가 앞 열차와의 3역 간격을 넘어서지 못하게 한다.
 */
export function tickTrack(
  track: Track,
  trains: Train[],
  deltaSec: number,
  gameSeconds: number,
  rng: () => number,
  spawnIdPrefix: string,
  spawnSeqRef: { current: number },
): Train[] {
  if (track.segmentSec.length === 0) return trains

  const sorted = [...trains].sort(
    (a, b) => trainPosition(b, track.segmentSec) - trainPosition(a, track.segmentSec),
  )

  const result: Train[] = []
  let aheadPos = Number.POSITIVE_INFINITY

  for (const original of sorted) {
    const train: Train = { ...original }
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
          train.activeDelay = undefined
        }
        continue
      }

      const segCount = track.segmentSec.length
      const segLen = track.isLoop ? track.segmentSec[train.segmentIndex % segCount] : track.segmentSec[train.segmentIndex]
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
            // 순환선: 소멸시키지 않고 한 바퀴를 돌아 다시 처음(0)부터 이어간다 (같은 열차가 계속 순환).
            train.segmentIndex -= segCount
          } else {
            arrivedTerminus = true
            break
          }
        }
        const rolled = rollDelay(gameSeconds, rng)
        if (rolled) {
          train.delayRemainingSec = rolled.durationSec
          train.activeDelay = { category: rolled.category, label: rolled.label }
        }
      }
    }

    if (arrivedTerminus) {
      // 종점 도착 -> 소멸 (aheadPos는 갱신하지 않음: 이 열차는 더 이상 존재하지 않으므로 뒤 열차 입장에서 그 다음으로 앞선 열차 기준을 따라야 하나,
      // 이미 aheadPos가 이전 루프의 값(더 앞섰던 열차 또는 Infinity)로 남아있어 안전측으로 동작한다.
      continue
    }

    result.push(train)
    aheadPos = trainPosition(train, track.segmentSec)
  }

  // 순환선은 소멸이 없으므로 별도 투입이 필요 없다. 종점이 있는 노선만 기점에 새 열차를 투입한다.
  if (!track.isLoop) {
    const rearmostPos = result.length > 0 ? Math.min(...result.map((t) => trainPosition(t, track.segmentSec))) : Infinity
    if (result.length === 0 || rearmostPos >= MIN_GAP_STATIONS - EPS) {
      result.push({
        id: `${spawnIdPrefix}-${track.id}-${spawnSeqRef.current++}`,
        trackId: track.id,
        segmentIndex: 0,
        segmentElapsedSec: 0,
        delayRemainingSec: 0,
      })
    }
  }

  return result
}
