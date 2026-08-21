export type DelayCategory = 'signal' | 'congestion' | 'incident'

interface DelayDef {
  id: string
  category: DelayCategory
  /** 미션 실행 화면(승차 중 패널)에 짧게 표시되는 라벨 */
  label: string
  /** 뉴스 티커/이력에 쓰이는 사유 문구 후보(복수면 무작위 선택). "OO에 {reason} 발생" 문장에 자연스럽게 들어가도록 고른다. */
  reasons: string[]
  /** 역 도착마다 판정하는 기본 발생확률 */
  baseProbability: number
  /** 출퇴근 시간대(07-09시, 18-20시)에 곱해지는 가중치 */
  rushHourMultiplier: number
  minDurationSec: number
  maxDurationSec: number
  /** 지연이 끝나는 시점에 이 확률로 "결국 해결하지 못함" 판정 — 열차가 정상 재개하지 못하고 노선에서 제거된다(강제 하차). 0이면 항상 정상 해소. */
  breakdownChance: number
}

/**
 * 게임 내 모든 열차 지연 종류와 사유별로 그럴듯한 시간 범위를 배분한 표.
 * 사유(reason)와 지속시간이 서로 맞물리도록 종류별로 별도 범위를 둔다 — "시위 발생"이 2분 만에 끝나거나
 * "스크린도어 오류"가 30분씩 걸리는 식의 부조화를 없앤다.
 * 신호 대기/혼잡은 네트워크 전역에서 초 단위로 매우 잦기 때문에(미션 패널의 소소한 지연 표시로만 노출),
 * 뉴스 티커에는 category==='incident'인 것만 노출한다(simulationStore.ts에서 필터링).
 */
const DELAY_DEFS: DelayDef[] = [
  {
    id: 'signal',
    category: 'signal',
    label: '신호 대기',
    reasons: ['신호 대기'],
    baseProbability: 0.05,
    rushHourMultiplier: 1.5,
    minDurationSec: 30,
    maxDurationSec: 120,
    breakdownChance: 0,
  },
  {
    id: 'congestion',
    category: 'congestion',
    label: '혼잡으로 인한 지연',
    reasons: ['혼잡'],
    baseProbability: 0.03,
    rushHourMultiplier: 6,
    minDurationSec: 30,
    maxDurationSec: 180,
    breakdownChance: 0,
  },
  {
    // 역 설비 문제 — 역무원이 원격/현장 조치. 열차 자체는 멀쩡하므로 고장 판정은 없음.
    id: 'psd',
    category: 'incident',
    label: '스크린도어 오류',
    reasons: ['스크린도어 오류'],
    baseProbability: 0.0015,
    rushHourMultiplier: 1,
    minDurationSec: 180,
    maxDurationSec: 480,
    breakdownChance: 0,
  },
  {
    // 안전 점검 목적 — 점검 후 항상 정상 재개.
    id: 'trackCheck',
    category: 'incident',
    label: '선로 점검',
    reasons: ['선로 이상'],
    baseProbability: 0.0006,
    rushHourMultiplier: 1,
    minDurationSec: 300,
    maxDurationSec: 900,
    breakdownChance: 0,
  },
  {
    // 경미한 이상 감지 후 확인차 정차 — 대부분 별문제 없이 재개.
    id: 'vehicleCheck',
    category: 'incident',
    label: '차량 점검',
    reasons: ['차량 점검'],
    baseProbability: 0.001,
    rushHourMultiplier: 1,
    minDurationSec: 120,
    maxDurationSec: 600,
    breakdownChance: 0,
  },
  {
    // 실제 기계적 고장 — 매우 드묾. 일정 확률로 수리에 실패해 승객을 전원 하차시키고 열차를 노선에서 제거한다.
    id: 'breakdown',
    category: 'incident',
    label: '열차 고장',
    reasons: ['열차 고장'],
    baseProbability: 0.0003,
    rushHourMultiplier: 1,
    minDurationSec: 600,
    maxDurationSec: 1800,
    breakdownChance: 0.2,
  },
  {
    // 열차/선로 자체엔 문제가 없는 외부 요인 — 오래 걸리지만 결국 정상화되므로 고장 판정은 없음.
    id: 'protest',
    category: 'incident',
    label: '시위·집회',
    reasons: ['시위', '집회'],
    baseProbability: 0.00015,
    rushHourMultiplier: 1,
    minDurationSec: 900,
    maxDurationSec: 2400,
    breakdownChance: 0,
  },
]

export function isRushHour(gameSeconds: number): boolean {
  const hour = (gameSeconds / 3600) % 24
  return (hour >= 7 && hour < 9) || (hour >= 18 && hour < 20)
}

export interface RolledDelay {
  category: DelayCategory
  label: string
  /** 뉴스 티커용 사유 문구 (예: "열차 고장", "시위") */
  reason: string
  durationSec: number
  /** true면 durationSec 경과 시점에 정상 재개하지 못하고 열차가 제거된다. */
  willBreakdown: boolean
}

/** 역 도착 시 호출. 지연이 발생하면 종류/지속시간/최종 결과를 반환, 아니면 null. */
export function rollDelay(gameSeconds: number, rng: () => number): RolledDelay | null {
  const rush = isRushHour(gameSeconds)
  for (const def of DELAY_DEFS) {
    const prob = def.baseProbability * (rush ? def.rushHourMultiplier : 1)
    if (rng() < prob) {
      const durationSec = def.minDurationSec + rng() * (def.maxDurationSec - def.minDurationSec)
      const reason = def.reasons[Math.floor(rng() * def.reasons.length)]
      const willBreakdown = def.breakdownChance > 0 && rng() < def.breakdownChance
      return { category: def.category, label: def.label, reason, durationSec, willBreakdown }
    }
  }
  return null
}
