import type { UpcomingTrain } from '../../simulation/missionPlayer'
import { formatDuration } from '../../utils/time'

interface StationPopoverProps {
  /** 컨테이너 기준 화면 좌표(px) */
  x: number
  y: number
  stationName: string
  lines: { id: string; name: string; color: string }[]
  /** 이 역에 다가오는 열차 목록(ETA 오름차순). 없으면 실시간 도착정보 섹션 자체를 생략한다. */
  upcomingTrains?: UpcomingTrain[]
  onClose: () => void
}

/**
 * 역 클릭 시 뜨는 정보창. SVG 도형이 아니라 일반 HTML 오버레이로 렌더링해서,
 * 지도 확대/축소 배율이나 화면 크기와 무관하게 항상 읽기 편한 실제 글자 크기(px)를 유지한다.
 */
export function StationPopover({ x, y, stationName, lines, upcomingTrains, onClose }: StationPopoverProps) {
  return (
    <div
      className="absolute z-20 -translate-x-1/2 -translate-y-full rounded-xl border border-white/15 bg-[#0d1117] px-4 py-3 text-white shadow-2xl"
      style={{ left: x, top: y - 16, minWidth: 140, maxWidth: 260 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-4">
        <span className="text-base font-bold leading-tight">{stationName}</span>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-sm text-gray-400"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {lines.map((line) => (
          <div key={line.id} className="flex items-center gap-2 text-sm text-gray-200">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: line.color }} />
            {line.name}
          </div>
        ))}
      </div>

      {upcomingTrains && (
        <div className="mt-2.5 flex flex-col gap-1 border-t border-white/10 pt-2.5">
          <p className="text-[11px] text-gray-400">실시간 도착정보</p>
          {upcomingTrains.length === 0 && <p className="text-xs text-gray-500">다가오는 열차 정보가 없습니다.</p>}
          {upcomingTrains.slice(0, 4).map((tr) => (
            <div key={`${tr.trackId}-${tr.trainId ?? 'spawn'}`} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-1.5 truncate">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tr.color }} />
                <span className="truncate text-gray-200">{tr.directionLabel}</span>
              </span>
              <span className="font-digital shrink-0 text-gray-400">{formatDuration(tr.etaSec)}</span>
            </div>
          ))}
        </div>
      )}

      {/* 말풍선 꼬리 */}
      <div className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-white/15 bg-[#0d1117]" />
    </div>
  )
}
