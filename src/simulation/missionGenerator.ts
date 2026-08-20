import { mulberry32, hashStringToSeed } from '../utils/rng'
import { findWaypointPath, getAllStationNames } from './routeGraph'
import { SUBWAY_LINES } from '../data/lines'

/**
 * 나머지 전체 노선망과 환승역을 하나도 공유하지 않아 그래프상 완전히 고립된 노선.
 * (실제로는 1호선 데이터가 의정부 이북 구간을 포함하지 않아 회룡 환승이 빠진 데이터 공백)
 * 이 역들이 미션 출발/경유/도착지로 뽑히면 다른 어떤 역과도 경로가 이어지지 않으므로 미션 풀에서 제외한다.
 */
const DISCONNECTED_LINE_IDS = new Set(['uijeongbuLrt'])

function buildMissionStationPool(): string[] {
  const excluded = new Set<string>()
  for (const line of SUBWAY_LINES) {
    if (!DISCONNECTED_LINE_IDS.has(line.id)) continue
    for (const stop of line.mainStops) excluded.add(stop.stationName)
    for (const branch of line.branches ?? []) for (const stop of branch.stops) excluded.add(stop.stationName)
  }
  return getAllStationNames().filter((name) => !excluded.has(name))
}

export interface Mission {
  id: string
  difficulty: 1 | 2 | 3
  /** [출발역, ...경유역, 도착역] */
  waypoints: string[]
  /** 예상 총 소요시간(초). 실제 소요시간과 동일 단위(게임 gameSeconds) */
  estimatedTotalSec: number
}

/** 난이도별 목표 총 소요시간 범위(초) — 실제 지하철 기준 대략 10~60분대 이동 */
const TARGET_RANGE: Record<1 | 2 | 3, [number, number]> = {
  1: [600, 1500],
  2: [1200, 2400],
  3: [2100, 3600],
}

function pickRandomDistinct(rng: () => number, pool: string[], count: number): string[] {
  const picked: string[] = []
  const usedIdx = new Set<number>()
  let guard = 0
  while (picked.length < count && guard < 2000) {
    guard++
    const idx = Math.floor(rng() * pool.length)
    if (usedIdx.has(idx)) continue
    usedIdx.add(idx)
    picked.push(pool[idx])
  }
  return picked
}

function generateOneMission(rng: () => number, pool: string[], difficulty: 1 | 2 | 3, idPrefix: string): Mission {
  const numWaypoints = difficulty + 1
  const [min, max] = TARGET_RANGE[difficulty]
  let best: { waypoints: string[]; totalSec: number } | null = null
  let bestDistToRange = Infinity

  for (let attempt = 0; attempt < 300; attempt++) {
    const points = pickRandomDistinct(rng, pool, numWaypoints)
    if (points.length < numWaypoints) continue
    const route = findWaypointPath(points)
    if (!route) continue
    if (route.totalSec >= min && route.totalSec <= max) {
      best = { waypoints: points, totalSec: route.totalSec }
      break
    }
    const distToRange = route.totalSec < min ? min - route.totalSec : route.totalSec - max
    if (distToRange < bestDistToRange) {
      bestDistToRange = distToRange
      best = { waypoints: points, totalSec: route.totalSec }
    }
  }

  if (!best) {
    // 극단적 예외 상황 대비 폴백: 풀에서 처음 두 역만 사용
    const fallbackPoints = pool.slice(0, numWaypoints)
    const route = findWaypointPath(fallbackPoints)
    best = { waypoints: fallbackPoints, totalSec: route?.totalSec ?? 0 }
  }

  return {
    id: `${idPrefix}-star${difficulty}`,
    difficulty,
    waypoints: best.waypoints,
    estimatedTotalSec: best.totalSec,
  }
}

/** dateKey(YYYY-MM-DD) 기준으로 결정적인 오늘의 미션 3개를 생성한다. */
export function generateDailyMissions(dateKey: string): Mission[] {
  const rng = mulberry32(hashStringToSeed(dateKey))
  const pool = buildMissionStationPool()
  return [1, 2, 3].map((d) => generateOneMission(rng, pool, d as 1 | 2 | 3, dateKey))
}

export function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
