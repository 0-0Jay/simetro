import { useEffect } from 'react'
import { useSimulationStore, TIME_COMPRESSION_RATE } from '../store/simulationStore'
import { useMissionStore } from '../store/missionStore'

/** 스토어 갱신(=리렌더) 빈도의 상한. 이 게임은 압축 배속에도 열차가 한 구간을 지나는 데 실제로 몇 초씩
 * 걸릴 만큼 느리게 움직이므로, 60~120Hz 디스플레이 주사율 그대로 매 프레임 갱신할 필요가 없다 — 초당
 * 24회면 눈에는 완전히 매끄럽게 보이면서, 매 프레임 새로 그려지던 700개 넘는 열차 마커/UI 리렌더 횟수를
 * 크게 줄여 발열·배터리 소모를 낮춘다. requestAnimationFrame 자체는 계속 매 프레임 호출되지만(그래야
 * 탭이 백그라운드일 때 자동으로 멈춘다), 실제 무거운 작업(advance/missionTick과 그로 인한 리렌더)은
 * 이 간격을 채웠을 때만 수행한다.
 */
const MIN_UPDATE_INTERVAL_SEC = 1 / 24

/** 게임 시계를 requestAnimationFrame으로 계속 전진시킨다. App 최상단에서 한 번만 마운트한다. */
export function useGameClockTicker() {
  const advance = useSimulationStore((s) => s.advance)
  const missionTick = useMissionStore((s) => s.tick)

  useEffect(() => {
    let rafId: number
    let lastUpdateTime = performance.now()

    const tick = (now: number) => {
      const elapsedSeconds = (now - lastUpdateTime) / 1000
      if (elapsedSeconds >= MIN_UPDATE_INTERVAL_SEC) {
        lastUpdateTime = now
        advance(elapsedSeconds)
        const { gameSeconds, tracks, trainsByTrack, lastWithdrawals } = useSimulationStore.getState()
        missionTick(elapsedSeconds * TIME_COMPRESSION_RATE, gameSeconds, tracks, trainsByTrack, lastWithdrawals)
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [advance, missionTick])
}
