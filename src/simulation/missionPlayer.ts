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
  /** 도착까지 남은 시간(게임초). etaSec 계산은 간격 제한을 반영하지 않으므로, blocked인 경우 실제로는 더 걸릴 수 있다. */
  etaSec: number
  /** 지금 이 순간 앞차와의 최소 간격 제한에 막혀 못 움직이는 상태인지(자기 자신의 지연은 아님). */
  blocked: boolean
}

/**
 * train이 지금 이 순간, 자기 자신의 지연은 없지만 앞쪽에서 실제로 지연 중인 열차 때문에
 * (그 사이 열차들이 전부 최소 간격으로 꽉 막혀 있어) 사실상 못 움직이는 상태인지 판정한다.
 *
 * 단순히 "바로 앞차와 MIN_GAP_STATIONS만큼 붙어있는지"만 보면 안 된다 — 혼잡한 노선에서는
 * 아무 문제 없이 정상 운행 중인 열차들도 평소에 최소 간격으로 붙어서 나란히 달리는 게 정상이기
 * 때문이다(그 자체는 지연이 아니라 정상적인 배차 간격 유지). 그래서 앞쪽으로 사슬을 따라가며,
 * 간격이 최소치로 계속 이어지는 동안 실제로 "지연 중(delayRemainingSec>0)"인 열차를 만나는지까지 확인한다 —
 * 만나면 그 지연이 뒤로 전파되어 나도 막힌 것이고, 중간에 여유(간격 벌어짐)가 생기면 사슬이 끊겨 막힌 게 아니다.
 */
export function isBlockedByAhead(train: Train, trainsOnTrack: Train[], segmentSec: number[]): boolean {
  if (train.delayRemainingSec > 0) return false
  const sorted = [...trainsOnTrack].sort((a, b) => trainPosition(b, segmentSec) - trainPosition(a, segmentSec))
  const idx = sorted.findIndex((t) => t.id === train.id)
  if (idx <= 0) return false

  let cursorPos = trainPosition(train, segmentSec)
  for (let i = idx - 1; i >= 0; i--) {
    const otherPos = trainPosition(sorted[i], segmentSec)
    if (otherPos - cursorPos > MIN_GAP_STATIONS + EPS) return false // 여유가 있는 열차를 만남 -> 사슬이 끊김, 막힌 게 아님
    if (sorted[i].delayRemainingSec > 0) return true // 실제로 지연 중인 열차를 만남 -> 그 지연이 사슬을 타고 나에게까지 전파됨
    cursorPos = otherPos
  }
  return false // 사슬 끝까지 아무도 실제로 지연 중이지 않음 -> 정상적으로 최소 간격을 유지하며 흐르는 중일 뿐
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
        blocked: isBlockedByAhead(train, trains, track.segmentSec),
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
          blocked: false,
        })
      }
    }
  }
  // "0분 00초"로 표시될 만큼 다 온(또는 정체로 그 자리에 계속 머무르는) 열차는 더 이상 "다가오는 열차"가 아니므로 목록에서 뺀다.
  // 안 그러면 정체 등으로 한 열차가 도착 지점 근처에 멈춰버릴 때 그 자리에 영원히 박힌 "유령 열차"로 보이게 된다.
  const arriving = result.filter((r) => r.etaSec >= 1)
  arriving.sort((a, b) => a.etaSec - b.etaSec)
  return arriving.slice(0, limit)
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
