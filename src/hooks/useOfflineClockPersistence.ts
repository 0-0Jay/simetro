import { useEffect } from 'react'
import { useSimulationStore, saveClock } from '../store/simulationStore'

/** 하드 종료(스와이프로 앱 지우기 등)로 visibilitychange/pagehide가 못 잡히는 경우를 대비한 최소한의 안전망. */
const PERIODIC_SAVE_INTERVAL_MS = 30_000

/** 탭이 숨겨지거나(백그라운드 전환) 닫힐 때, 그리고 주기적으로 현재 게임 시각을 저장해둔다.
 *  simulationStore가 다음 실행 시 이 값과 그때의 실제 타임스탬프 차이로 오프라인 동안 흐른 시간을 따라잡는다.
 *  App 최상단에서 한 번만 마운트한다. */
export function useOfflineClockPersistence() {
  useEffect(() => {
    const save = () => saveClock(useSimulationStore.getState().gameSeconds)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') save()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', save)
    const intervalId = window.setInterval(save, PERIODIC_SAVE_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', save)
      window.clearInterval(intervalId)
      save()
    }
  }, [])
}
