import { describe, expect, it } from 'vitest'
import { buildTracks } from './tracks'

describe('buildTracks — 9호선 급행 데이터 배선', () => {
  const tracks = buildTracks()
  const fwd = tracks.find((t) => t.id === 'line9-main-fwd')!
  const bwd = tracks.find((t) => t.id === 'line9-main-bwd')!

  it('9호선 본선 fwd/bwd 트랙에 급행 정보가 붙어 있다', () => {
    expect(fwd.expressStopIndices).toBeDefined()
    expect(fwd.passingStationIndices).toBeDefined()
    expect(fwd.expressSegmentSec).toBeDefined()
    expect(bwd.expressStopIndices).toBeDefined()
  })

  it('급행 정차역 개수가 실제 9호선 급행 정차역 수(17개: 시종점 포함)와 일치한다', () => {
    expect(fwd.expressStopIndices!.size).toBe(17)
    expect(bwd.expressStopIndices!.size).toBe(17)
  })

  it('실제 급행 정차역 이름들이 fwd 트랙의 올바른 인덱스에 매핑된다', () => {
    const name = (i: number) => fwd.stops[i]?.name
    const expressNames = [...fwd.expressStopIndices!].map(name).sort()
    expect(expressNames).toEqual(
      [
        '개화',
        '김포공항',
        '마곡나루',
        '가양',
        '염창',
        '당산',
        '여의도',
        '노량진',
        '동작',
        '고속터미널',
        '신논현',
        '선정릉',
        '봉은사',
        '종합운동장',
        '석촌',
        '올림픽공원',
        '중앙보훈병원',
      ].sort(),
    )
  })

  it('fwd/bwd는 역 순서가 반대라 같은 역이라도 인덱스가 다르다(정방향 재계산 확인)', () => {
    const fwdGimpoIdx = fwd.stops.findIndex((s) => s.name === '김포공항')
    const bwdGimpoIdx = bwd.stops.findIndex((s) => s.name === '김포공항')
    expect(fwd.expressStopIndices!.has(fwdGimpoIdx)).toBe(true)
    expect(bwd.expressStopIndices!.has(bwdGimpoIdx)).toBe(true)
    expect(fwdGimpoIdx).not.toBe(bwdGimpoIdx) // 서로 다른 방향이라 인덱스가 같을 이유가 없음(우연 제외)
  })

  it('급행 통과역의 급행 구간 소요시간은 완행보다 짧고, 정차역 구간은 완행과 같다', () => {
    // 급행 정차역이 아닌 임의의 통과역을 하나 찾아 그 직전 구간을 비교한다.
    const passThroughIdx = fwd.stops.findIndex((_s, i) => i > 0 && !fwd.expressStopIndices!.has(i))
    expect(passThroughIdx).toBeGreaterThan(0)
    expect(fwd.expressSegmentSec![passThroughIdx - 1]).toBeLessThan(fwd.segmentSec[passThroughIdx - 1])

    const stopIdx = [...fwd.expressStopIndices!].find((i) => i > 0)!
    expect(fwd.expressSegmentSec![stopIdx - 1]).toBe(fwd.segmentSec[stopIdx - 1])
  })

  it('다른 노선(급행 없음)은 급행 관련 필드가 없다', () => {
    const line2 = tracks.find((t) => t.id === 'line2-main-fwd')!
    expect(line2.expressStopIndices).toBeUndefined()
    expect(line2.passingStationIndices).toBeUndefined()
    expect(line2.expressSegmentSec).toBeUndefined()
  })

  it('지선에는 급행이 적용되지 않는다(9호선은 지선이 없어 이 테스트는 일반 원칙만 확인)', () => {
    const branchTracks = tracks.filter((t) => t.branchLabel !== undefined)
    for (const t of branchTracks) {
      expect(t.expressStopIndices).toBeUndefined()
    }
  })
})
