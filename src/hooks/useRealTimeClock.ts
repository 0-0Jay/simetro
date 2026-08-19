import { useEffect, useState } from 'react'

/** 실제 기기 시계를 1초 간격으로 갱신한다 (게임 내부 시뮬레이션 시각과는 별개). */
export function useRealTimeClock(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return now
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export function formatRealClock(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  const dateStr = `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}(${WEEKDAYS[date.getDay()]})`
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  return `${dateStr} ${timeStr}`
}
