import type { Track } from './tracks'
import type { Train } from './train'
import { trainPosition } from './train'
import { MIN_GAP_STATIONS } from './engine'

const EPS = 1e-6

export interface UpcomingTrain {
  trackId: string
  /** null이면 아직 스폰되지 않은, 곧 이 트랙의 기점에 새로 투입될 열차(종점에서 반대 방향 탈출용) */
  trainId: string | null
  lineId: string
  lineName: string
  color: string
  directionLabel: string
  /** 도착까지 남은 시간(게임초) */
  etaSec: number
}

export function stationIndexInTrack(track: Track, stationName: string): number {
  return track.stops.findIndex((s) => s.name === stationName)
}

/** "2호선 외선순환" / "4호선 오이도행" 처럼, 사람이 읽을 수 있는 이 트랙(방향)의 이름 */
export function directionLabelFor(track: Track): string {
  const base = track.branchLabel ? `${track.lineName} ${track.branchLabel}` : track.lineName
  if (track.isLoop) {
    return `${base} ${track.direction === 'fwd' ? '외선순환' : '내선순환'}`
  }
  const terminus = track.stops[track.stops.length - 1].name
  return `${base} ${terminus}행`
}

/**
 * train이 targetIndex(stops 배열 인덱스, 역)에 도달하기까지 걸리는 시간(게임초).
 * 이미 지나친 역이고 순환선이 아니면 이 열차로는 갈 수 없으므로 null.
 * 순환선이면 한 바퀴 돌아 다시 도달하는 시간을 계산한다.
 */
export function trainEtaToStation(train: Train, track: Track, targetIndex: number): number | null {
  const segCount = track.segmentSec.length
  const pos = trainPosition(train, track.segmentSec)

  let remainingUnits: number
  if (targetIndex >= pos - EPS) {
    remainingUnits = targetIndex - pos
  } else if (track.isLoop) {
    remainingUnits = segCount - pos + targetIndex
  } else {
    return null
  }
  if (remainingUnits < 0) remainingUnits = 0

  let idx = train.segmentIndex
  let cursorFrac = pos - idx
  let seconds = train.delayRemainingSec

  while (remainingUnits > EPS) {
    const segLen = track.segmentSec[idx % segCount]
    const remainInSeg = 1 - cursorFrac
    const take = Math.min(remainingUnits, remainInSeg)
    seconds += take * segLen
    remainingUnits -= take
    idx += 1
    cursorFrac = 0
  }
  return seconds
}

/** stationName을 지나는 모든 트랙의 모든 열차에 대해 도착 예정 시간을 계산해 오름차순으로 반환한다. */
export function getUpcomingTrains(
  stationName: string,
  tracks: Track[],
  trainsByTrack: Record<string, Train[]>,
  limit = 8,
): UpcomingTrain[] {
  const result: UpcomingTrain[] = []
  for (const track of tracks) {
    const idx = stationIndexInTrack(track, stationName)
    if (idx < 0) continue
    const trains = trainsByTrack[track.id] ?? []
    const directionLabel = directionLabelFor(track)
    for (const train of trains) {
      const eta = trainEtaToStation(train, track, idx)
      if (eta === null) continue
      result.push({
        trackId: track.id,
        trainId: train.id,
        lineId: track.lineId,
        lineName: track.lineName,
        color: track.color,
        directionLabel,
        etaSec: eta,
      })
    }

    // 이 역이 이 트랙(방향)의 기점(index 0)인 경우: 기존 열차는 이미 지나쳐서 다시 도달할 수 없으므로
    // "곧 새로 투입될 열차"를 별도로 계산한다. 안 그러면 종점에서 반대 방향으로 나갈 방법이 사라진다.
    if (idx === 0 && !track.isLoop && trains.length > 0) {
      const rearmost = trains.reduce((min, t) =>
        trainPosition(t, track.segmentSec) < trainPosition(min, track.segmentSec) ? t : min,
      )
      const spawnEta = trainEtaToStation(rearmost, track, MIN_GAP_STATIONS)
      if (spawnEta !== null) {
        result.push({
          trackId: track.id,
          trainId: null,
          lineId: track.lineId,
          lineName: track.lineName,
          color: track.color,
          directionLabel,
          etaSec: spawnEta,
        })
      }
    }
  }
  result.sort((a, b) => a.etaSec - b.etaSec)
  return result.slice(0, limit)
}

/**
 * 한 틱 동안 oldSegIndex -> newSegIndex로 이동하며 지나친 역들의 stops 인덱스를 순서대로 반환한다.
 * 순환선은 newSegIndex가 oldSegIndex보다 작아도(한 바퀴 랩) 올바르게 처리한다.
 */
export function stationsCrossedThisTick(oldSegIndex: number, newSegIndex: number, track: Track): number[] {
  const segCount = track.segmentSec.length
  const crossed: number[] = []
  if (track.isLoop) {
    const delta = (((newSegIndex - oldSegIndex) % segCount) + segCount) % segCount
    for (let i = 1; i <= delta; i++) crossed.push((oldSegIndex + i) % segCount)
  } else {
    const delta = Math.max(0, newSegIndex - oldSegIndex)
    for (let i = 1; i <= delta; i++) crossed.push(oldSegIndex + i)
  }
  return crossed
}
