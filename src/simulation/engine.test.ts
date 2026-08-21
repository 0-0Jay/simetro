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

/** 주어진 값을 순서대로 반환하다가 소진되면 0.999999(=거의 항상 확률 미달)를 반환하는 rng. rollDelay 판정을 결정론적으로 조작할 때 쓴다. */
function scriptedRng(sequence: number[]): () => number {
  let i = 0
  return () => (i < sequence.length ? sequence[i++] : 0.999999)
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

  it.each([20, 21, 7, 13, 3])(
    'segCount=%i인 순환선: 이음매(마지막 열차 -> 첫 열차, 한 바퀴 건너) 간격도 MIN_GAP_STATIONS 이상이다',
    (segCount) => {
      const track = makeLoopTrack(segCount)
      for (let phase = 0; phase < MIN_GAP_STATIONS; phase++) {
        const trains = initializeTrainsForTrack(track, phase, 'init')
        if (trains.length < 2) continue // 열차가 1대 이하면 이음매 충돌 자체가 성립하지 않음
        const sorted = [...trains].sort((a, b) => trainPosition(b, track.segmentSec) - trainPosition(a, track.segmentSec))
        const frontPos = trainPosition(sorted[0], track.segmentSec)
        const backPos = trainPosition(sorted[sorted.length - 1], track.segmentSec)
        const wrapGap = segCount - frontPos + backPos
        expect(wrapGap).toBeGreaterThanOrEqual(MIN_GAP_STATIONS)
      }
    },
  )
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

describe('tickTrack — 순환선 이음매 간격 시행', () => {
  it('맨 앞차는 아주 큰 틱이 와도 맨 뒤차(이음매 건너편)와 MIN_GAP_STATIONS보다 가까워지지 않는다', () => {
    const track = makeLoopTrack(10) // segCount=10
    let trains: Train[] = [
      { id: 'back', trackId: track.id, segmentIndex: 1, segmentElapsedSec: 0, delayRemainingSec: 2000 }, // 긴 지연으로 이 틱 내내 정지
      { id: 'front', trackId: track.id, segmentIndex: 8, segmentElapsedSec: 0, delayRemainingSec: 0 },
    ]
    const seqRef = { current: 0 }
    // 배경 탭에서 오래 있다 돌아온 것처럼 한 번에 아주 큰 델타를 준다.
    trains = tickTrack(track, trains, 1000, 1000, noRng, 'train', seqRef)
    const back = trains.find((t) => t.id === 'back')!
    const front = trains.find((t) => t.id === 'front')!
    const backPos = trainPosition(back, track.segmentSec)
    const frontPos = trainPosition(front, track.segmentSec)
    expect(backPos).toBeCloseTo(1, 5) // 정지 상태 그대로
    const wrapGap = track.segmentSec.length - frontPos + backPos
    expect(wrapGap).toBeGreaterThanOrEqual(MIN_GAP_STATIONS - 1e-6)
  })

  it('initializeTrainsForTrack + 이음매 시행을 함께 써도 전체가 얼어붙지 않는다(슬랙 확보 확인)', () => {
    const track = makeLoopTrack(20)
    let trains: Train[] = initializeTrainsForTrack(track, 0, 'init')
    const seqRef = { current: 0 }
    const beforeById = new Map(trains.map((t) => [t.id, trainPosition(t, track.segmentSec)]))

    for (let i = 0; i < 50; i++) {
      trains = tickTrack(track, trains, 30, 1000 + i * 30, noRng, 'train', seqRef)
    }
    let totalMovement = 0
    for (const t of trains) {
      const before = beforeById.get(t.id)
      if (before !== undefined) totalMovement += Math.abs(trainPosition(t, track.segmentSec) - before)
    }
    expect(totalMovement).toBeGreaterThan(1)
  })

  it('이음매 시행 하에서도 한 대의 긴 지연이 전체를 영구 정지(데드락)시키지 않는다', () => {
    const track = makeLoopTrack(20)
    let trains: Train[] = initializeTrainsForTrack(track, 0, 'init')
    const seqRef = { current: 0 }
    const frontmost = [...trains].sort((a, b) => trainPosition(b, track.segmentSec) - trainPosition(a, track.segmentSec))[0]
    trains = trains.map((t) =>
      t.id === frontmost.id
        ? { ...t, delayRemainingSec: 1200, activeDelay: { category: 'incident' as const, label: '열차 고장', reason: '열차 고장', willBreakdown: false } }
        : t,
    )

    for (let i = 0; i < 400; i++) {
      trains = tickTrack(track, trains, 10, 1000 + i * 10, noRng, 'train', seqRef)
    }
    expect(trains.every((t) => t.delayRemainingSec === 0)).toBe(true)
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

describe('tickTrack — 지연 해결/미해결', () => {
  it('willBreakdown이 없는 지연은 만료되면 정상적으로 재개된다(열차가 사라지지 않음)', () => {
    const track = makeTrack({
      stops: [{ name: 'A', cumulativeKm: 0 }, { name: 'B', cumulativeKm: 1 }, { name: 'C', cumulativeKm: 2 }],
      segmentSec: [60, 60],
    })
    let trains: Train[] = [{ id: 'solo', trackId: track.id, segmentIndex: 0, segmentElapsedSec: 55, delayRemainingSec: 0 }]
    const seqRef = { current: 0 }
    // DELAY_DEFS 순서(signal, congestion, psd, ...) 중 psd(스크린도어 오류, breakdownChance:0)만 당첨시킨다.
    const rng = scriptedRng([0.9, 0.9, 0.0001, 0.5, 0.5])
    trains = tickTrack(track, trains, 10, 1000, rng, 'train', seqRef)
    expect(trains[0].activeDelay?.willBreakdown).toBe(false)
    const delaySec = trains[0].delayRemainingSec
    expect(delaySec).toBeGreaterThan(0)

    trains = tickTrack(track, trains, delaySec + 5, 1010, noRng, 'train', seqRef)
    expect(trains.some((t) => t.id === 'solo')).toBe(true)
    expect(trains.find((t) => t.id === 'solo')?.activeDelay).toBeUndefined()
  })

  it('willBreakdown 판정을 받은 지연이 만료되면 열차가 노선에서 제거되고 onWithdraw가 호출된다', () => {
    const track = makeTrack({
      stops: [{ name: 'A', cumulativeKm: 0 }, { name: 'B', cumulativeKm: 1 }, { name: 'C', cumulativeKm: 2 }],
      segmentSec: [60, 60],
    })
    let trains: Train[] = [{ id: 'solo', trackId: track.id, segmentIndex: 0, segmentElapsedSec: 55, delayRemainingSec: 0 }]
    const seqRef = { current: 0 }
    const withdrawEvents: { trainId: string; stationName: string; label: string; reason: string }[] = []
    // signal/congestion/psd/trackCheck/vehicleCheck 5개를 모두 탈락시키고 breakdown(열차 고장)만 당첨시킨 뒤,
    // duration 절반, reason 첫 번째(유일한 값), willBreakdown도 당첨시킨다.
    const rng = scriptedRng([0.9, 0.9, 0.9, 0.9, 0.9, 0.0001, 0.5, 0.5, 0.01])

    trains = tickTrack(track, trains, 10, 1000, rng, 'train', seqRef, undefined, (e) => withdrawEvents.push(e))
    expect(trains[0].activeDelay?.willBreakdown).toBe(true)
    const delaySec = trains[0].delayRemainingSec
    expect(delaySec).toBeGreaterThan(0)
    expect(withdrawEvents).toHaveLength(0)

    trains = tickTrack(track, trains, delaySec + 5, 1010, noRng, 'train', seqRef, undefined, (e) => withdrawEvents.push(e))
    expect(trains.some((t) => t.id === 'solo')).toBe(false)
    expect(withdrawEvents).toHaveLength(1)
    expect(withdrawEvents[0]).toMatchObject({ trainId: 'solo', stationName: 'B', reason: '열차 고장' })
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
