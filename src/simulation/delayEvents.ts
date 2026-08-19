export type DelayCategory = 'signal' | 'congestion' | 'incident'

interface DelayDef {
  category: DelayCategory
  label: string
  /** 역 도착마다 판정하는 기본 발생확률 */
  baseProbability: number
  /** 출퇴근 시간대(07-09시, 18-20시)에 곱해지는 가중치 */
  rushHourMultiplier: number
  minDurationSec: number
  maxDurationSec: number
}

const DELAY_DEFS: DelayDef[] = [
  { category: 'signal', label: '신호 대기', baseProbability: 0.06, rushHourMultiplier: 1.5, minDurationSec: 5, maxDurationSec: 15 },
  { category: 'congestion', label: '혼잡으로 인한 지연', baseProbability: 0.04, rushHourMultiplier: 5, minDurationSec: 15, maxDurationSec: 40 },
  { category: 'incident', label: '차량 점검', baseProbability: 0.004, rushHourMultiplier: 1, minDurationSec: 60, maxDurationSec: 180 },
]

export function isRushHour(gameSeconds: number): boolean {
  const hour = (gameSeconds / 3600) % 24
  return (hour >= 7 && hour < 9) || (hour >= 18 && hour < 20)
}

export interface RolledDelay {
  category: DelayCategory
  label: string
  durationSec: number
}

/** 역 도착 시 호출. 지연이 발생하면 종류/지속시간을 반환, 아니면 null. */
export function rollDelay(gameSeconds: number, rng: () => number): RolledDelay | null {
  const rush = isRushHour(gameSeconds)
  for (const def of DELAY_DEFS) {
    const prob = def.baseProbability * (rush ? def.rushHourMultiplier : 1)
    if (rng() < prob) {
      const durationSec = def.minDurationSec + rng() * (def.maxDurationSec - def.minDurationSec)
      return { category: def.category, label: def.label, durationSec }
    }
  }
  return null
}
