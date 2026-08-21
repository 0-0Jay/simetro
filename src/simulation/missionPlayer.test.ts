import { describe, expect, it } from 'vitest'
import { stationIndexInTrack, directionLabelFor, trainEtaToStation, getUpcomingTrains, stationsCrossedThisTick, isBlockedByAhead } from './missionPlayer'
import { MIN_GAP_STATIONS } from './engine'
import type { Track } from './tracks'
import type { Train } from './train'

function makeTrack(overrides: Partial<Track> = {}): Track {
  const stops = ['서울역', '시청', '종각', '종로3가', '종로5가'].map((name, i) => ({ name, cumulativeKm: i }))
  const segmentSec = stops.slice(1).map(() => 90)
  return {
    id: 'test-track-fwd',
    lineId: 'line1',
    lineName: '1호선',
    color: '#0052A4',
    direction: 'fwd',
    stops,
    segmentSec,
    segmentBends: stops.slice(1).map(() => []),
    isLoop: false,
    ...overrides,
  }
}

function makeTrain(overrides: Partial<Train> = {}): Train {
  return { id: 't1', trackId: 'test-track-fwd', segmentIndex: 0, segmentElapsedSec: 0, delayRemainingSec: 0, ...overrides }
}

describe('stationIndexInTrack', () => {
  it('존재하는 역의 인덱스를 반환한다', () => {
    expect(stationIndexInTrack(makeTrack(), '종각')).toBe(2)
  })
  it('존재하지 않는 역은 -1을 반환한다', () => {
    expect(stationIndexInTrack(makeTrack(), '없는역')).toBe(-1)
  })
})

describe('directionLabelFor', () => {
  it('순환선은 fwd=외선순환, bwd=내선순환으로 표기한다', () => {
    const loop = makeTrack({ isLoop: true, lineName: '2호선', direction: 'fwd' })
    expect(directionLabelFor(loop)).toBe('2호선 외선순환')
    expect(directionLabelFor({ ...loop, direction: 'bwd' })).toBe('2호선 내선순환')
  })

  it('일반 노선은 "OO행"으로 종점 이름을 붙인다', () => {
    expect(directionLabelFor(makeTrack())).toBe('1호선 종로5가행')
  })

  it('지선은 "노선명 지선명 종점행" 형태다', () => {
    const branch = makeTrack({ branchLabel: '성수지선' })
    expect(directionLabelFor(branch)).toBe('1호선 성수지선 종로5가행')
  })
})

describe('trainEtaToStation', () => {
  it('앞쪽 역까지 남은 시간을 정확히 계산한다(지연 포함)', () => {
    const track = makeTrack()
    const train = makeTrain({ segmentIndex: 0, segmentElapsedSec: 30, delayRemainingSec: 15 })
    // 서울역(0)->시청(1) 구간 90초 중 30초 지남 -> 60초 남음 + 지연 15초 = 75초
    expect(trainEtaToStation(train, track, 1)).toBe(75)
  })

  it('이미 지나친 역은(비순환선) null을 반환한다', () => {
    const track = makeTrack()
    const train = makeTrain({ segmentIndex: 2, segmentElapsedSec: 0 })
    expect(trainEtaToStation(train, track, 1)).toBeNull()
  })

  it('순환선은 이미 지나친 역도 한 바퀴 돌아 다시 도달하는 시간을 계산한다', () => {
    const loop: Track = {
      ...makeTrack(),
      isLoop: true,
      stops: ['A', 'B', 'C', 'A'].map((name, i) => ({ name, cumulativeKm: i })),
      segmentSec: [60, 60, 60],
    }
    const train = makeTrain({ segmentIndex: 2, segmentElapsedSec: 0 }) // C -> A 구간 시작점
    // 목표가 인덱스 0(A)인데 이미 segmentIndex=2(C->A 진행중)라 pos(2) > 0 -> 한 바퀴(세그먼트 3개) 돌아야 함
    const eta = trainEtaToStation(train, loop, 0)
    expect(eta).not.toBeNull()
    expect(eta).toBeGreaterThan(0)
  })
})

describe('stationsCrossedThisTick', () => {
  it('비순환선: oldIndex+1..newIndex를 순서대로 반환한다', () => {
    expect(stationsCrossedThisTick(2, 5, makeTrack({ segmentSec: [1, 1, 1, 1, 1, 1] }))).toEqual([3, 4, 5])
  })

  it('비순환선: 이동이 없으면 빈 배열', () => {
    expect(stationsCrossedThisTick(2, 2, makeTrack())).toEqual([])
  })

  it('순환선: 이음매를 넘어가는 경우 wrap해서 올바른 순서로 반환한다', () => {
    const loop = makeTrack({ isLoop: true, segmentSec: [1, 1, 1, 1] }) // segCount=4
    // oldIndex=3에서 newIndex=1로 "wrap"됨(3->0->1), 지나친 역은 [0, 1]이어야 한다.
    expect(stationsCrossedThisTick(3, 1, loop)).toEqual([0, 1])
  })
})

describe('getUpcomingTrains', () => {
  it('ETA 오름차순으로 정렬한다', () => {
    const track = makeTrack()
    const trainsByTrack = {
      [track.id]: [
        makeTrain({ id: 'far', segmentIndex: 0, segmentElapsedSec: 0 }),
        makeTrain({ id: 'near', segmentIndex: 1, segmentElapsedSec: 80 }),
      ],
    }
    const result = getUpcomingTrains('종각', [track], trainsByTrack)
    expect(result.map((r) => r.trainId)).toEqual(['near', 'far'])
  })

  it('0분 00초로 표시될 만큼 도착이 임박한(1초 미만) 항목은 목록에서 제외한다', () => {
    // 종점 근처에 정체된 상황을 흉내: 역에 사실상 도착해 있는(ETA<1초) 열차는 "유령 열차"로 남지 않도록 걸러야 한다.
    const track = makeTrack()
    const trainsByTrack = { [track.id]: [makeTrain({ id: 'stuck', segmentIndex: 2, segmentElapsedSec: 89.9 })] }
    const result = getUpcomingTrains('종로3가', [track], trainsByTrack)
    expect(result).toHaveLength(0)
  })

  it('트랙의 기점(index 0)은 기존 열차 대신 "곧 투입될 열차"를 합성해서 보여준다', () => {
    const track = makeTrack()
    const trainsByTrack = { [track.id]: [makeTrain({ id: 'rearmost', segmentIndex: 0, segmentElapsedSec: 30 })] }
    const result = getUpcomingTrains('서울역', [track], trainsByTrack)
    expect(result).toHaveLength(1)
    expect(result[0].trainId).toBeNull()
    // rearmost가 MIN_GAP_STATIONS에 도달해야 신규 투입되므로 ETA > 0
    expect(result[0].etaSec).toBeGreaterThan(0)
  })

  it('limit을 넘는 결과는 잘라낸다', () => {
    const track = makeTrack()
    const trains = Array.from({ length: 5 }, (_, i) => makeTrain({ id: `t${i}`, segmentIndex: 1, segmentElapsedSec: i }))
    const result = getUpcomingTrains('종각', [track], { [track.id]: trains }, 2)
    expect(result).toHaveLength(2)
  })
})

describe('isBlockedByAhead', () => {
  it('앞차가 최소 간격으로 붙어있어도 그 앞차가 실제로 지연 중이 아니면 막힌 게 아니다(정상적인 배차 간격일 뿐)', () => {
    const track = makeTrack()
    const ahead = makeTrain({ id: 'ahead', segmentIndex: 3, segmentElapsedSec: 0 }) // delayRemainingSec: 0(지연 없음)
    const me = makeTrain({ id: 'me', segmentIndex: 1, segmentElapsedSec: 0 })
    expect(isBlockedByAhead(me, [ahead, me], track.segmentSec)).toBe(false)
  })

  it('바로 앞차가 최소 간격으로 붙어있고 실제로 지연 중이면 막힌 것으로 판정한다', () => {
    const track = makeTrack()
    const ahead = makeTrain({ id: 'ahead', segmentIndex: 3, segmentElapsedSec: 0, delayRemainingSec: 30 })
    const me = makeTrain({ id: 'me', segmentIndex: 1, segmentElapsedSec: 0 })
    expect(isBlockedByAhead(me, [ahead, me], track.segmentSec)).toBe(true)
  })

  it('지연 중인 열차가 앞쪽 사슬 너머에 있어도, 그 사이가 전부 최소 간격으로 이어져 있으면 막힌 것으로 전파된다', () => {
    const track = makeTrack()
    const farAhead = makeTrain({ id: 'far', segmentIndex: 4, segmentElapsedSec: 0, delayRemainingSec: 30 })
    const mid = makeTrain({ id: 'mid', segmentIndex: 2, segmentElapsedSec: 0 }) // far와 정확히 MIN_GAP만큼 붙음, 자기 지연은 없음
    const me = makeTrain({ id: 'me', segmentIndex: 0, segmentElapsedSec: 0 }) // mid와 정확히 MIN_GAP만큼 붙음
    expect(isBlockedByAhead(me, [farAhead, mid, me], track.segmentSec)).toBe(true)
  })

  it('중간에 여유(간격 벌어짐)가 있으면 그 너머의 지연은 전파되지 않는다', () => {
    const track = makeTrack()
    const farAhead = makeTrain({ id: 'far', segmentIndex: 4, segmentElapsedSec: 0, delayRemainingSec: 30 })
    const mid = makeTrain({ id: 'mid', segmentIndex: 1, segmentElapsedSec: 0 }) // far와 간격 3(여유 있음) -> 사슬 끊김. mid 자신은 지연 없음.
    const me = makeTrain({ id: 'me', segmentIndex: 0, segmentElapsedSec: 45 }) // mid와 최소 간격 이내로 붙어있지만, mid가 안 막혔으므로 나도 안 막혀야 한다.
    expect(isBlockedByAhead(me, [farAhead, mid, me], track.segmentSec)).toBe(false)
  })

  it('앞차와 간격이 여유 있으면(최소 간격 초과) 막힌 게 아니다', () => {
    const track = makeTrack()
    const ahead = makeTrain({ id: 'ahead', segmentIndex: 4, segmentElapsedSec: 0, delayRemainingSec: 30 })
    const me = makeTrain({ id: 'me', segmentIndex: 1, segmentElapsedSec: 0 })
    expect(isBlockedByAhead(me, [ahead, me], track.segmentSec)).toBe(false)
  })

  it('자기 자신이 지연 중이면(이미 별도 표시가 있으므로) 막힌 것으로 치지 않는다', () => {
    const track = makeTrack()
    const ahead = makeTrain({ id: 'ahead', segmentIndex: 3, segmentElapsedSec: 0, delayRemainingSec: 30 })
    const me = makeTrain({ id: 'me', segmentIndex: 1, segmentElapsedSec: 0, delayRemainingSec: 10 })
    expect(isBlockedByAhead(me, [ahead, me], track.segmentSec)).toBe(false)
  })

  it('맨 앞차(앞에 아무도 없음)는 막힌 게 아니다', () => {
    const track = makeTrack()
    const front = makeTrain({ id: 'front', segmentIndex: 3, segmentElapsedSec: 0 })
    expect(isBlockedByAhead(front, [front], track.segmentSec)).toBe(false)
  })
})

describe('getUpcomingTrains — blocked 플래그', () => {
  it('실제로 지연 중인 앞차에 최소 간격으로 막힌 열차는 blocked:true로 표시한다', () => {
    const track = makeTrack()
    const trainsByTrack = {
      [track.id]: [
        makeTrain({ id: 'ahead', segmentIndex: 3, segmentElapsedSec: 0, delayRemainingSec: 30 }),
        makeTrain({ id: 'stuck', segmentIndex: 1, segmentElapsedSec: 0 }),
      ],
    }
    const result = getUpcomingTrains('종로3가', [track], trainsByTrack)
    const stuck = result.find((r) => r.trainId === 'stuck')
    expect(stuck?.blocked).toBe(true)
  })

  it('앞차가 최소 간격으로 붙어있어도 지연 중이 아니면 blocked:false다', () => {
    const track = makeTrack()
    const trainsByTrack = {
      [track.id]: [
        makeTrain({ id: 'ahead', segmentIndex: 3, segmentElapsedSec: 0 }),
        makeTrain({ id: 'normal', segmentIndex: 1, segmentElapsedSec: 0 }),
      ],
    }
    const result = getUpcomingTrains('종로3가', [track], trainsByTrack)
    const normal = result.find((r) => r.trainId === 'normal')
    expect(normal?.blocked).toBe(false)
  })
})

// MIN_GAP_STATIONS를 참조해서 트랙 간격 관례가 바뀌면 이 테스트 스위트도 같이 눈에 띄게 깨지도록 한다.
describe('MIN_GAP_STATIONS 상수', () => {
  it('현재 정책: 역 1개 간격(인덱스 차이 2)', () => {
    expect(MIN_GAP_STATIONS).toBe(2)
  })
})
