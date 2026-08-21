import { useEffect } from 'react'
import { useSimulationStore, TIME_COMPRESSION_RATE } from '../store/simulationStore'
import { useMissionStore } from '../store/missionStore'

/** 게임 시계를 requestAnimationFrame으로 계속 전진시킨다. App 최상단에서 한 번만 마운트한다. */
export function useGameClockTicker() {
  const advance = useSimulationStore((s) => s.advance)
  const missionTick = useMissionStore((s) => s.tick)

  useEffect(() => {
    let rafId: number
    let lastTime = performance.now()

    const tick = (now: number) => {
      const deltaSeconds = (now - lastTime) / 1000
      lastTime = now
      advance(deltaSeconds)
      const { gameSeconds, tracks, trainsByTrack, lastWithdrawals } = useSimulationStore.getState()
      missionTick(deltaSeconds * TIME_COMPRESSION_RATE, gameSeconds, tracks, trainsByTrack, lastWithdrawals)
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [advance, missionTick])
}
