import { describe, expect, it } from 'vitest'
import { findShortestPath, findWaypointPath, getAllStationNames } from './routeGraph'

describe('findShortestPath', () => {
  it('같은 역이면 0초짜리 1-스텝 경로를 반환한다', () => {
    const route = findShortestPath('강남', '강남')
    expect(route).not.toBeNull()
    expect(route?.totalSec).toBe(0)
    expect(route?.steps).toHaveLength(1)
  })

  it('존재하지 않는 역이면 null을 반환한다', () => {
    expect(findShortestPath('존재하지않는역이름', '강남')).toBeNull()
  })

  it('인접한 두 역 사이 경로는 환승 없이 이어진다', () => {
    const route = findShortestPath('시청', '종각')
    expect(route).not.toBeNull()
    expect(route?.steps.every((s) => !s.isTransfer)).toBe(true)
  })

  it('실제로 환승이 필요한 먼 두 역은 경로 어딘가에 isTransfer 스텝을 포함한다', () => {
    // 1호선 청량리 -> 5호선 상일동: 노선이 겹치지 않으므로 최소 한 번은 환승해야 한다.
    const route = findShortestPath('청량리', '상일동')
    expect(route).not.toBeNull()
    expect(route?.steps.some((s) => s.isTransfer)).toBe(true)
  })
})

describe('findWaypointPath', () => {
  it('경유지를 순서대로 이어붙이고, 경유지 자체는 경로에서 중복되지 않는다', () => {
    const route = findWaypointPath(['시청', '종각', '종로3가'])
    expect(route).not.toBeNull()
    const names = route!.steps.map((s) => s.station)
    // 경유지(종각)가 두 번(도착으로 한 번, 다음 구간 출발로 한 번) 나오지 않아야 한다.
    expect(names.filter((n) => n === '종각')).toHaveLength(1)
    expect(names[0]).toBe('시청')
    expect(names[names.length - 1]).toBe('종로3가')
  })

  it('경유지가 2개 미만이면 null', () => {
    expect(findWaypointPath(['시청'])).toBeNull()
  })
})

describe('getAllStationNames', () => {
  it('빈 배열이 아니고 중복이 없다', () => {
    const names = getAllStationNames()
    expect(names.length).toBeGreaterThan(100)
    expect(new Set(names).size).toBe(names.length)
  })

  it('여러 노선이 공유하는 실제 환승역 이름을 포함한다', () => {
    const names = getAllStationNames()
    expect(names).toContain('시청')
    expect(names).toContain('이수') // 4호선/7호선 환승역 이름 통일 회귀 테스트
  })
})
