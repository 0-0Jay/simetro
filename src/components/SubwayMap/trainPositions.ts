import type { Track } from '../../simulation/tracks'
import type { Train } from '../../simulation/train'
import { trainPosition } from '../../simulation/train'
import { getStationCoord } from '../../data/coordinates'

export interface RenderedTrain {
  id: string
  x: number
  y: number
  /** 진행 방향, degrees (0 = 오른쪽/+x, 시계방향 증가 — SVG rotate와 동일 규칙) */
  angle: number
  color: string
  lineId: string
  hasDelay: boolean
}

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

/** track.stops -> 좌표 배열은 track이 살아있는 한 절대 안 바뀌는데(정적 데이터), 이 계산이 이전엔
 * 매 프레임(열차 위치 갱신마다) 트랙 수만큼 매번 새로 돌고 있었다. track.id로 한 번만 계산해 캐싱한다. */
const coordsCache = new Map<string, ([number, number] | undefined)[]>()
function coordsForTrack(track: Track): ([number, number] | undefined)[] {
  let coords = coordsCache.get(track.id)
  if (!coords) {
    coords = track.stops.map((s) => getStationCoord(s.name))
    coordsCache.set(track.id, coords)
  }
  return coords
}

/** points(다중 절점 폴리라인)를 따라 t(0~1, 호 길이 비율) 위치의 좌표와 진행각(도)을 계산 */
function pointAndAngleAt(points: [number, number][], t: number): { x: number; y: number; angle: number } {
  if (points.length < 2) {
    const p = points[0] ?? [0, 0]
    return { x: p[0], y: p[1], angle: 0 }
  }
  const segLens = []
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const d = dist(points[i - 1], points[i])
    segLens.push(d)
    total += d
  }
  if (total === 0) {
    const p = points[0]
    return { x: p[0], y: p[1], angle: 0 }
  }
  const target = Math.max(0, Math.min(1, t)) * total
  let acc = 0
  for (let i = 0; i < segLens.length; i++) {
    const segLen = segLens[i]
    if (acc + segLen >= target - 1e-9 || i === segLens.length - 1) {
      const localT = segLen === 0 ? 0 : Math.max(0, Math.min(1, (target - acc) / segLen))
      const [x0, y0] = points[i]
      const [x1, y1] = points[i + 1]
      const angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI
      return { x: x0 + (x1 - x0) * localT, y: y0 + (y1 - y0) * localT, angle }
    }
    acc += segLen
  }
  const last = points[points.length - 1]
  return { x: last[0], y: last[1], angle: 0 }
}

export function computeTrainScreenPositions(
  tracks: Track[],
  trainsByTrack: Record<string, Train[]>,
): RenderedTrain[] {
  const result: RenderedTrain[] = []
  for (const track of tracks) {
    const trains = trainsByTrack[track.id]
    if (!trains || trains.length === 0) continue
    const coords = coordsForTrack(track)
    if (coords.some((c) => !c)) continue // 아직 좌표 배치가 안 된 노선은 지도에 표시하지 않음

    for (const train of trains) {
      const pos = trainPosition(train, track.segmentSec)
      const idx = Math.min(Math.floor(pos), coords.length - 2)
      const frac = Math.max(0, Math.min(1, pos - idx))
      const bends = track.segmentBends[idx] ?? []
      const segPoints: [number, number][] = [coords[idx]!, ...bends, coords[idx + 1] ?? coords[idx]!]
      const { x, y, angle } = pointAndAngleAt(segPoints, frac)
      result.push({
        id: train.id,
        x,
        y,
        angle,
        color: track.color,
        lineId: track.lineId,
        hasDelay: !!train.activeDelay,
      })
    }
  }
  return result
}
