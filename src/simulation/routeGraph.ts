import { SUBWAY_LINES } from '../data/lines'
import type { LineStop, SubwayLine } from '../data/types'

/** 환승 시 고정으로 걸리는 시간(초). 같은 역, 다른 노선으로 갈아탈 때 적용 */
const TRANSFER_PENALTY_SEC = 120

interface Edge {
  to: string
  seconds: number
  lineId: string
}

let graph: Map<string, Edge[]> | null = null

function addEdge(map: Map<string, Edge[]>, a: string, b: string, seconds: number, lineId: string) {
  if (!map.has(a)) map.set(a, [])
  map.get(a)!.push({ to: b, seconds, lineId })
}

function buildGraph(): Map<string, Edge[]> {
  const map = new Map<string, Edge[]>()

  function addSequence(stops: LineStop[], lineId: string) {
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1].stationName
      const b = stops[i].stationName
      const sec = stops[i].travelTimeSec
      addEdge(map, a, b, sec, lineId)
      addEdge(map, b, a, sec, lineId)
    }
  }

  for (const line of SUBWAY_LINES as SubwayLine[]) {
    addSequence(line.mainStops, line.id)
    for (const branch of line.branches ?? []) {
      const fromStop = line.mainStops.find((s) => s.stationName === branch.fromStationName)
      if (!fromStop) continue
      addSequence([{ stationName: fromStop.stationName, cumulativeKm: fromStop.cumulativeKm, travelTimeSec: 0 }, ...branch.stops], line.id)
    }
  }

  return map
}

function getGraph(): Map<string, Edge[]> {
  if (!graph) graph = buildGraph()
  return graph
}

export interface RouteStep {
  station: string
  /** 이 역에 도착하기까지 걸린 시간(초, 출발역 기준 누적) */
  cumulativeSec: number
  /** 이 역 직전 구간에서 탄 노선 id (출발역은 null) */
  lineId: string | null
  /** 직전 역과 다른 노선으로 갈아탄 지점인지 */
  isTransfer: boolean
}

export interface RouteResult {
  steps: RouteStep[]
  totalSec: number
}

interface PrevInfo {
  station: string
  lineId: string
}

/**
 * 다익스트라 최단경로. 노선을 바꿔 탈 때마다 TRANSFER_PENALTY_SEC를 비용에 더해
 * 불필요하게 잦은 환승보다 직행/최소환승 경로를 우대한다.
 */
export function findShortestPath(from: string, to: string): RouteResult | null {
  const g = getGraph()
  if (!g.has(from) || !g.has(to)) return null
  if (from === to) return { steps: [{ station: from, cumulativeSec: 0, lineId: null, isTransfer: false }], totalSec: 0 }

  const dist = new Map<string, number>()
  const prev = new Map<string, PrevInfo>()
  const visited = new Set<string>()
  dist.set(from, 0)

  const queue = new Set<string>([from])

  while (queue.size > 0) {
    let current: string | null = null
    let currentDist = Infinity
    for (const node of queue) {
      const d = dist.get(node) ?? Infinity
      if (d < currentDist) { currentDist = d; current = node }
    }
    if (current === null) break
    queue.delete(current)
    if (visited.has(current)) continue
    visited.add(current)
    if (current === to) break

    const arrivingLineId = prev.get(current)?.lineId
    for (const edge of g.get(current) ?? []) {
      if (visited.has(edge.to)) continue
      const transferCost = arrivingLineId && arrivingLineId !== edge.lineId ? TRANSFER_PENALTY_SEC : 0
      const newDist = currentDist + edge.seconds + transferCost
      if (newDist < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, newDist)
        prev.set(edge.to, { station: current, lineId: edge.lineId })
        queue.add(edge.to)
      }
    }
  }

  if (!dist.has(to)) return null

  const pathNames: string[] = []
  let cur: string | undefined = to
  while (cur) {
    pathNames.unshift(cur)
    cur = prev.get(cur)?.station
  }

  const steps: RouteStep[] = pathNames.map((station) => {
    const info = prev.get(station)
    return { station, cumulativeSec: dist.get(station) ?? 0, lineId: info?.lineId ?? null, isTransfer: false }
  })
  for (let i = 1; i < steps.length; i++) {
    steps[i].isTransfer = steps[i].lineId !== steps[i - 1].lineId && steps[i - 1].lineId !== null
  }
  return { steps, totalSec: dist.get(to) ?? 0 }
}

/** 여러 경유지를 순서대로 통과하는 전체 경로를 만든다 (출발 -> 경유1 -> 경유2 -> ... -> 도착) */
export function findWaypointPath(waypoints: string[]): RouteResult | null {
  if (waypoints.length < 2) return null
  const allSteps: RouteStep[] = []
  let totalSec = 0
  for (let i = 0; i < waypoints.length - 1; i++) {
    const leg = findShortestPath(waypoints[i], waypoints[i + 1])
    if (!leg) return null
    const offset = totalSec
    const legSteps = leg.steps.map((s) => ({ ...s, cumulativeSec: s.cumulativeSec + offset }))
    if (i > 0) legSteps.shift() // 경유지 중복 제거
    allSteps.push(...legSteps)
    totalSec += leg.totalSec
  }
  return { steps: allSteps, totalSec }
}

export function getAllStationNames(): string[] {
  return [...getGraph().keys()]
}

export { TRANSFER_PENALTY_SEC }
