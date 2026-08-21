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

/** 헤더 뉴스 티커용 사유 문구 후보(카테고리별). label과 별개로, "OO역에 {reason} 발생" 문장에 자연스럽게 들어가도록 다양하게 둔다. */
const NEWS_REASONS: Record<DelayCategory, string[]> = {
  signal: ['신호 점검', '신호 장애'],
  congestion: ['극심한 혼잡', '이용객 급증'],
  incident: ['열차 고장', '차량 점검', '선로 점검', '스크린도어 오류', '시위 발생'],
}

export function isRushHour(gameSeconds: number): boolean {
  const hour = (gameSeconds / 3600) % 24
  return (hour >= 7 && hour < 9) || (hour >= 18 && hour < 20)
}

export interface RolledDelay {
  category: DelayCategory
  label: string
  /** 뉴스 티커용 사유 문구 (예: "열차 고장", "시위 발생") */
  reason: string
  durationSec: number
}

/** 역 도착 시 호출. 지연이 발생하면 종류/지속시간을 반환, 아니면 null. */
export function rollDelay(gameSeconds: number, rng: () => number): RolledDelay | null {
  const rush = isRushHour(gameSeconds)
  for (const def of DELAY_DEFS) {
    const prob = def.baseProbability * (rush ? def.rushHourMultiplier : 1)
    if (rng() < prob) {
      const durationSec = def.minDurationSec + rng() * (def.maxDurationSec - def.minDurationSec)
      const pool = NEWS_REASONS[def.category]
      const reason = pool[Math.floor(rng() * pool.length)]
      return { category: def.category, label: def.label, reason, durationSec }
    }
  }
  return null
}
