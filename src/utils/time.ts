/** 게임초(gameSeconds) 단위 소요시간을 "N분 SS초" 형태로 표시한다. */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}분 ${rem.toString().padStart(2, '0')}초`
}
