import { describe, expect, it } from 'vitest'
import {
  computeCatchUpGameSeconds,
  wrapGameSeconds,
  SERVICE_START_SECONDS,
  SERVICE_END_SECONDS,
  LAST_TRAIN_CUTOFF_SECONDS,
  TIME_COMPRESSION_RATE,
} from './simulationStore'

describe('TIME_COMPRESSION_RATE', () => {
  it('게임 내 1분 = 실제 2초 (요청된 배율)', () => {
    // 게임 60초를 만드는 데 필요한 실제 초 = 60 / TIME_COMPRESSION_RATE
    expect(60 / TIME_COMPRESSION_RATE).toBeCloseTo(2, 10)
  })
})

describe('computeCatchUpGameSeconds — 오프라인 시간 따라잡기(1:1, 배속 미적용)', () => {
  it('오프라인 동안 흐른 실제 시간만큼 압축 없이 그대로 게임 시각에 더한다', () => {
    const savedGameSeconds = 36000 // 10:00:00
    const savedAtMs = 1_000_000_000_000
    const twoHoursLaterMs = savedAtMs + 2 * 3600 * 1000
    const result = computeCatchUpGameSeconds(savedGameSeconds, savedAtMs, twoHoursLaterMs)
    expect(result).toBeCloseTo(36000 + 2 * 3600, 5) // 12:00:00 — TIME_COMPRESSION_RATE와 무관하게 정확히 2시간
  })

  it('실제 시간이 거의 안 지났으면 게임 시각도 거의 그대로다', () => {
    const savedAtMs = 1_000_000_000_000
    const result = computeCatchUpGameSeconds(40000, savedAtMs, savedAtMs + 500)
    expect(result).toBeCloseTo(40000.5, 5)
  })

  it('저장 시각이 미래(시계 오차 등)여도 게임 시각이 뒤로 가지 않는다', () => {
    const savedAtMs = 1_000_000_000_000
    const result = computeCatchUpGameSeconds(40000, savedAtMs, savedAtMs - 5000) // now < savedAt
    expect(result).toBeCloseTo(40000, 5)
  })

  it('서비스 종료 시각을 넘어가면 다음날 첫차 시간대부터 다시 감아 넣는다', () => {
    const span = SERVICE_END_SECONDS - SERVICE_START_SECONDS
    const savedGameSeconds = SERVICE_END_SECONDS - 100 // 막차 직전
    const savedAtMs = 1_000_000_000_000
    const elapsedSec = 200 // span을 넘기기에 충분
    const result = computeCatchUpGameSeconds(savedGameSeconds, savedAtMs, savedAtMs + elapsedSec * 1000)
    expect(result).toBeGreaterThanOrEqual(SERVICE_START_SECONDS)
    expect(result).toBeLessThan(SERVICE_END_SECONDS)
    // savedGameSeconds + elapsedSec = SERVICE_END_SECONDS + 100 -> 하루를 넘긴 만큼(100초)만 다음날 첫차부터 흘렀어야 함
    expect(result).toBeCloseTo(SERVICE_START_SECONDS + 100, 5)
    void span
  })

  it('여러 날치 시간이 지나도(앱을 며칠간 안 켠 경우) 정상 범위로 감아 넣는다', () => {
    const savedAtMs = 1_000_000_000_000
    const threeDaysMs = 3 * 24 * 3600 * 1000
    const result = computeCatchUpGameSeconds(SERVICE_START_SECONDS, savedAtMs, savedAtMs + threeDaysMs)
    expect(result).toBeGreaterThanOrEqual(SERVICE_START_SECONDS)
    expect(result).toBeLessThan(SERVICE_END_SECONDS)
    expect(Number.isFinite(result)).toBe(true)
  })

  it('막차 시간대 이후로 감기면 LAST_TRAIN_CUTOFF_SECONDS 이상일 수 있다(심야 빈 열차 판정에 쓰임)', () => {
    const savedAtMs = 1_000_000_000_000
    const savedGameSeconds = LAST_TRAIN_CUTOFF_SECONDS - 50
    const result = computeCatchUpGameSeconds(savedGameSeconds, savedAtMs, savedAtMs + 100 * 1000)
    expect(result).toBeGreaterThanOrEqual(LAST_TRAIN_CUTOFF_SECONDS)
  })
})

describe('wrapGameSeconds', () => {
  it('범위 안의 값은 그대로 SERVICE_START 기준으로 되돌린다', () => {
    expect(wrapGameSeconds(100)).toBe(SERVICE_START_SECONDS + 100)
  })

  it('음수(0 미만)도 안전하게 양의 범위로 감아 넣는다', () => {
    const span = SERVICE_END_SECONDS - SERVICE_START_SECONDS
    const result = wrapGameSeconds(-50)
    expect(result).toBeCloseTo(SERVICE_START_SECONDS + span - 50, 5)
  })
})
