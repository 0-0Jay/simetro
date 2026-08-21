/** 게임초(gameSeconds) 단위 소요시간을 "N분 SS초" 형태로 표시한다. */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}분 ${rem.toString().padStart(2, '0')}초`
}

/** 지연 뉴스 헤드라인용: 분 단위로 반올림하되 최소 1분으로 표시한다(예: "5분"). */
export function formatDelayMinutes(sec: number): string {
  return `${Math.max(1, Math.round(sec / 60))}분`
}
