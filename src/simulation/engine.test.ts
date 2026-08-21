import { describe, expect, it } from 'vitest'
import { initializeTrainsForTrack, tickTrack, MIN_GAP_STATIONS, LAST_TRAIN_CUTOFF_SECONDS, SERVICE_END_SECONDS } from './engine'
import { trainPosition } from './train'
import type { Track } from './tracks'
import type { Train } from './train'

function makeTrack(overrides: Partial<Track> = {}): Track {
  const stopNames = ['A', 'B', 'C', 'D', 'E', 'F']
  const stops = stopNames.map((name, i) => ({ name, cumulativeKm: i }))
  const segmentSec = stops.slice(1).map(() => 60)
  return {
    id: 'test-track',
    lineId: 'test',
    lineName: '테스트선',
    color: '#000000',
    direction: 'fwd',
    stops,
    segmentSec,
    segmentBends: stops.slice(1).map(() => []),
    isLoop: false,
    ...overrides,
  }
}

function makeLoopTrack(stationCount = 5): Track {
  // 루프 트랙은 첫 역과 마지막 역 이름이 같다 (stationCount개의 실제 역 + 이음매).
  const names = Array.from({ length: stationCount }, (_, i) => `S${i}`)
  const stops = [...names, names[0]].map((name, i) => ({ name, cumulativeKm: i }))
  return makeTrack({ id: 'loop-track', stops, segmentSec: stops.slice(1).map(() => 60), isLoop: true })
}

function noRng() {
  // rollDelay가 절대 발동하지 않도록 항상 1에 가까운 값을 반환(baseProbability보다 항상 크게).
  return 0.999999
}

describe('initializeTrainsForTrack', () => {
  it('MIN_GAP_STATIONS 간격으로 phase부터 끝까지 채운다', () => {
    const track = makeTrack()
    const trains = initializeTrainsForTrack(track, 0, 'init')
    expect(trains.map((t) => t.segmentIndex)).toEqual([0, 2, 4])
  })

  it('phase만큼 시작 위치가 밀린다', () => {
    const track = makeTrack()
    const trains = initializeTrainsForTrack(track, 1, 'init')
    expect(trains.map((t) => t.segmentIndex)).toEqual([1, 3])
  })
})

describe('tickTrack — 간격 유지', () => {
  it('여러 틱을 진행해도 어떤 두 열차도 MIN_GAP_STATIONS보다 가까워지지 않는다', () => {
    const track = makeTrack({ stops: Array.from({ length: 30 }, (_, i) => ({ name: `S${i}`, cumulativeKm: i })), segmentSec: Array.from({ length: 29 }, () => 90) })
    let trains: Train[] = initializeTrainsForTrack(track, 0, 'init')
    const seqRef = { current: 0 }

    for (let i = 0; i < 200; i++) {
      trains = tickTrack(track, trains, 30, 1000 + i * 30, noRng, 'train', seqRef)
      const positions = trains.map((t) => trainPosition(t, track.segmentSec)).sort((a, b) => a - b)
      for (let j = 1; j < positions.length; j++) {
        expect(positions[j] - positions[j - 1]).toBeGreaterThanOrEqual(MIN_GAP_STATIONS - 1e-6)
      }
    }
  })
})

describe('tickTrack — 순환선', () => {
  it('segmentIndex가 segCount에 도달하면 소멸하지 않고 0으로 wrap한다', () => {
    const track = makeLoopTrack(4) // segCount = 4
    let trains: Train[] = [{ id: 't1', trackId: track.id, segmentIndex: 3, segmentElapsedSec: 55, delayRemainingSec: 0 }]
    const seqRef = { current: 0 }

    trains = tickTrack(track, trains, 10, 1000, noRng, 'train', seqRef)
    expect(trains).toHaveLength(1)
    expect(trains[0].segmentIndex).toBeLessThan(track.segmentSec.length)
    expect(trains[0].segmentIndex).toBeGreaterThanOrEqual(0)
  })

  it('한 대만 있는 루프에서도 여러 바퀴를 돌아도 계속 같은 열차가 순환한다(소멸 없음)', () => {
    const track = makeLoopTrack(3)
    let trains: Train[] = [{ id: 'solo', trackId: track.id, segmentIndex: 0, segmentElapsedSec: 0, delayRemainingSec: 0 }]
    const seqRef = { current: 0 }
    for (let i = 0; i < 50; i++) {
      trains = tickTrack(track, trains, 60, 1000, noRng, 'train', seqRef)
    }
    expect(trains).toHaveLength(1)
    expect(trains[0].id).toBe('solo')
  })
})

describe('tickTrack — 종점 소멸/재투입', () => {
  it('종점에 도달한 열차는 사라지고, 뒤가 비면 기점에 새 열차가 투입된다', () => {
    const track = makeTrack({ stops: [{ name: 'A', cumulativeKm: 0 }, { name: 'B', cumulativeKm: 1 }], segmentSec: [60] })
    let trains: Train[] = [{ id: 'solo', trackId: track.id, segmentIndex: 0, segmentElapsedSec: 55, delayRemainingSec: 0 }]
    const seqRef = { current: 0 }

    trains = tickTrack(track, trains, 10, 1000, noRng, 'train', seqRef)
    // 종점 도착으로 solo는 사라지고, 뒤가 비었으니(result.length===0) 새 열차가 기점(segmentIndex 0)에 즉시 투입된다.
    expect(trains.some((t) => t.id === 'solo')).toBe(false)
    expect(trains).toHaveLength(1)
    expect(trains[0].segmentIndex).toBe(0)
  })
})

describe('tickTrack — 막차 시간대', () => {
  it('LAST_TRAIN_CUTOFF_SECONDS 이후에는 신규 열차가 투입되지 않는다', () => {
    const track = makeTrack({ stops: [{ name: 'A', cumulativeKm: 0 }, { name: 'B', cumulativeKm: 1 }], segmentSec: [60] })
    let trains: Train[] = []
    const seqRef = { current: 0 }
    trains = tickTrack(track, trains, 10, LAST_TRAIN_CUTOFF_SECONDS + 1, noRng, 'train', seqRef)
    expect(trains).toHaveLength(0)
  })

  it('막차 시간대 이전에는 정상적으로 신규 투입된다', () => {
    const track = makeTrack({ stops: [{ name: 'A', cumulativeKm: 0 }, { name: 'B', cumulativeKm: 1 }], segmentSec: [60] })
    let trains: Train[] = []
    const seqRef = { current: 0 }
    trains = tickTrack(track, trains, 10, LAST_TRAIN_CUTOFF_SECONDS - 1, noRng, 'train', seqRef)
    expect(trains).toHaveLength(1)
  })

  it('막차 시간대 이후 순환선은 현재 바퀴를 마치는 시점에 소멸한다', () => {
    const track = makeLoopTrack(4)
    let trains: Train[] = [{ id: 'solo', trackId: track.id, segmentIndex: 3, segmentElapsedSec: 55, delayRemainingSec: 0 }]
    const seqRef = { current: 0 }
    trains = tickTrack(track, trains, 10, LAST_TRAIN_CUTOFF_SECONDS + 1, noRng, 'train', seqRef)
    expect(trains).toHaveLength(0)
  })

  it('LAST_TRAIN_CUTOFF_SECONDS는 SERVICE_END_SECONDS보다 작다(막차 유예 구간이 실제로 존재)', () => {
    expect(LAST_TRAIN_CUTOFF_SECONDS).toBeLessThan(SERVICE_END_SECONDS)
  })
})
