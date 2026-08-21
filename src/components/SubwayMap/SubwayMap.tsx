import { memo, useMemo, useRef, useState } from 'react'
import { useSimulationStore } from '../../store/simulationStore'
import { buildMapData, type MapLineSegment, type MapStation } from './mapData'
import { computeTrainScreenPositions } from './trainPositions'
import { usePanZoom } from './usePanZoom'
import { StationPopover } from './StationPopover'
import { LineLegend } from './LineLegend'
import { StationSearch } from './StationSearch'
import { MAP_VIEWBOX, getStationCoord } from '../../data/coordinates'
import { SUBWAY_LINES } from '../../data/lines'
import { getUpcomingTrains } from '../../simulation/missionPlayer'
import { mix } from '../../utils/color'

const LINE_COLOR_BY_ID = new Map(SUBWAY_LINES.map((l) => [l.id, l.color]))
const LINE_INFO_BY_ID = new Map(SUBWAY_LINES.map((l) => [l.id, { name: l.name, color: l.color }]))

/** 오른쪽(+x, 0도)을 기준으로 그린 화살표 모양. transform으로 위치/회전을 적용한다. */
const TRAIN_ARROW_PATH = 'M 5.5 0 L -3.5 -3.6 L -1.6 0 L -3.5 3.6 Z'

const WAYPOINT_STATUS_COLOR: Record<'done' | 'next' | 'pending', string> = {
  done: '#2ea043',
  next: '#ff9500',
  pending: '#8b949e',
}

/**
 * 노선/역(1000개가 넘는 SVG 엘리먼트)은 한 번 계산되면 그 안의 값이 절대 바뀌지 않는데,
 * 부모 SubwayMap은 열차 위치 때문에 매 프레임(요청되는 애니메이션 프레임마다) 리렌더링된다.
 * 이 정적 레이어를 분리해서 memo로 감싸두면, segments/stations/onStationClick 참조가 그대로인 한
 * (실제로 컴포넌트 생애주기 내내 안 바뀜) 매 프레임 이 부분은 리렌더링을 건너뛰어, 매초 수만 개씩
 * 새로 만들어지던 React 엘리먼트를 없애 발열/배터리 소모를 크게 줄인다.
 */
const StaticMapLayer = memo(function StaticMapLayer({
  segments,
  stations,
  onStationClick,
}: {
  segments: MapLineSegment[]
  stations: MapStation[]
  onStationClick: (name: string) => void
}) {
  return (
    <>
      {/* 노선 (그림자 언더레이 + 실제 색 라인) */}
      {segments.map((seg) => (
        <polyline
          key={`${seg.key}-under`}
          points={seg.points.map((p) => p.join(',')).join(' ')}
          fill="none"
          stroke="#000000"
          strokeOpacity={0.35}
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {segments.map((seg) => (
        <polyline
          key={seg.key}
          points={seg.points.map((p) => p.join(',')).join(' ')}
          fill="none"
          stroke={seg.color}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* 일반역: 작은 흰 테두리 원 + 역명 라벨 */}
      {stations
        .filter((st) => !st.isTransfer)
        .map((st) => (
          <g key={st.name} onClick={(e) => { e.stopPropagation(); onStationClick(st.name) }} style={{ cursor: 'pointer' }}>
            <circle cx={st.x} cy={st.y} r={7} fill="transparent" />
            <circle
              cx={st.x}
              cy={st.y}
              r={3.2}
              fill={LINE_COLOR_BY_ID.get(st.lineIds[0]) ?? '#ffffff'}
              stroke="#0d1117"
              strokeWidth={1}
            />
            <text
              x={st.x}
              y={st.y - 7}
              textAnchor="middle"
              fontSize={8.5}
              fontWeight={400}
              fill="#d7dde3"
              stroke="#0d1117"
              strokeWidth={2.2}
              paintOrder="stroke"
              style={{ fontFamily: 'system-ui, sans-serif' }}
            >
              {st.name}
            </text>
          </g>
        ))}

      {/* 환승역: 크게 강조 + 굵은 역명 라벨 */}
      {stations
        .filter((st) => st.isTransfer)
        .map((st) => (
          <g key={st.name} onClick={(e) => { e.stopPropagation(); onStationClick(st.name) }} style={{ cursor: 'pointer' }}>
            <circle cx={st.x} cy={st.y} r={7} fill="#0d1117" stroke="#ffffff" strokeWidth={2.6} />
            <text
              x={st.x}
              y={st.y - 11}
              textAnchor="middle"
              fontSize={12}
              fontWeight={700}
              fill="#ffffff"
              stroke="#0d1117"
              strokeWidth={3}
              paintOrder="stroke"
              style={{ fontFamily: 'system-ui, sans-serif' }}
            >
              {st.name}
            </text>
          </g>
        ))}
    </>
  )
})

export interface SubwayMapRider {
  mode: 'waiting' | 'riding'
  station?: string
  trainId?: string
}

interface SubwayMapProps {
  rider?: SubwayMapRider | null
  waypointMarkers?: { name: string; status: 'done' | 'next' | 'pending' }[]
}

export function SubwayMap({ rider, waypointMarkers }: SubwayMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const tracks = useSimulationStore((s) => s.tracks)
  const trainsByTrack = useSimulationStore((s) => s.trainsByTrack)
  const [selectedStation, setSelectedStation] = useState<string | null>(null)
  const [legendOpen, setLegendOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [focusEnabled, setFocusEnabled] = useState(true)

  const { segments, stations } = useMemo(() => buildMapData(), [])
  const trains = useMemo(() => computeTrainScreenPositions(tracks, trainsByTrack), [tracks, trainsByTrack])

  const riderPoint = useMemo(() => {
    if (!rider) return null
    if (rider.mode === 'waiting' && rider.station) {
      const c = getStationCoord(rider.station)
      return c ? { x: c[0], y: c[1] } : null
    }
    if (rider.mode === 'riding' && rider.trainId) {
      const t = trains.find((tr) => tr.id === rider.trainId)
      return t ? { x: t.x, y: t.y } : null
    }
    return null
  }, [rider, trains])

  const { transform, setTransform, handlers } = usePanZoom(
    svgRef,
    MAP_VIEWBOX,
    { scale: 1, tx: 0, ty: 0 },
    rider && focusEnabled ? riderPoint : null,
  )

  /** 검색 결과를 선택하면 그 역을 화면 중앙에 두는 배율로 지도를 이동시킨다(자동 추적 중이었다면 끈다). */
  const JUMP_SCALE = 4
  function jumpToStation(x: number, y: number) {
    setFocusEnabled(false)
    setTransform({
      scale: JUMP_SCALE,
      tx: MAP_VIEWBOX.minX + MAP_VIEWBOX.width / 2 - x * JUMP_SCALE,
      ty: MAP_VIEWBOX.minY + MAP_VIEWBOX.height / 2 - y * JUMP_SCALE,
    })
  }

  const selected = stations.find((st) => st.name === selectedStation)

  // 선택된 역의 지도 좌표(map)를 실제 화면 픽셀 좌표로 투영한다.
  // 순서: (1) 우리 <g> 팬/줌 transform 적용 -> viewBox 좌표계 위 점, (2) svg의 preserveAspectRatio(slice)가
  // viewBox 중심을 항상 화면 중심에 놓는다는 성질을 이용해 화면 픽셀로 변환.
  const selectedScreenPos = (() => {
    if (!selected || !svgRef.current) return null
    const rect = svgRef.current.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const browserScale = Math.max(rect.width / MAP_VIEWBOX.width, rect.height / MAP_VIEWBOX.height)
    const centerVX = MAP_VIEWBOX.minX + MAP_VIEWBOX.width / 2
    const centerVY = MAP_VIEWBOX.minY + MAP_VIEWBOX.height / 2
    const px = selected.x * transform.scale + transform.tx
    const py = selected.y * transform.scale + transform.ty
    return {
      x: rect.width / 2 + (px - centerVX) * browserScale,
      y: rect.height / 2 + (py - centerVY) * browserScale,
    }
  })()

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`${MAP_VIEWBOX.minX} ${MAP_VIEWBOX.minY} ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full touch-none select-none bg-[var(--bg)]"
        onClick={() => setSelectedStation(null)}
        {...handlers}
      >
      <g transform={`translate(${transform.tx} ${transform.ty}) scale(${transform.scale})`}>
        <StaticMapLayer segments={segments} stations={stations} onStationClick={setSelectedStation} />

        {/* 미션 경유지 강조 링 — 다음 목표는 크게 부풀며 깜빡이고, 나머지는 은은하게 깜빡인다 */}
        {waypointMarkers?.map((wp, i) => {
          const coord = getStationCoord(wp.name)
          if (!coord) return null
          const isNext = wp.status === 'next'
          return (
            <g key={`${wp.name}-${i}`}>
              <circle
                cx={coord[0]}
                cy={coord[1]}
                r={24}
                fill="none"
                stroke={WAYPOINT_STATUS_COLOR[wp.status]}
                strokeWidth={isNext ? 7 : 4}
                strokeDasharray={wp.status === 'pending' ? '6 4' : undefined}
                className={isNext ? 'waypoint-ring-next' : 'waypoint-ring-soft'}
              />
              <circle
                cx={coord[0] + 18}
                cy={coord[1] - 18}
                r={isNext ? 15 : 12}
                fill={WAYPOINT_STATUS_COLOR[wp.status]}
                stroke="#0d1117"
                strokeWidth={2}
                className={isNext ? 'waypoint-badge-next' : undefined}
              />
              <text x={coord[0] + 18} y={coord[1] - 12} textAnchor="middle" fontSize={15} fontWeight={700} fill="#ffffff">
                {i + 1}
              </text>
            </g>
          )
        })}

        {/* 실시간 열차 위치 — 진행방향을 가리키는 화살표. 급행은 노선색을 살짝 밝게(흰색 혼합) 해서 구분한다. */}
        {trains.map((tr) => (
          <path
            key={tr.id}
            d={TRAIN_ARROW_PATH}
            transform={`translate(${tr.x} ${tr.y}) rotate(${tr.angle})`}
            fill={tr.hasDelay ? '#ff3b30' : tr.isExpress ? mix(tr.color, '#ffffff', 0.55) : tr.color}
            stroke="#ffffff"
            strokeWidth={0.9}
            strokeLinejoin="round"
          />
        ))}

        {/* 미션 플레이어(탑승객) 위치 — 붉은 점 */}
        {riderPoint && (
          <circle cx={riderPoint.x} cy={riderPoint.y} r={7} fill="#ff3b30" stroke="#ffffff" strokeWidth={2} />
        )}
      </g>
      </svg>

      {selected && selectedScreenPos && (
        <StationPopover
          x={selectedScreenPos.x}
          y={selectedScreenPos.y}
          stationName={selected.name}
          lines={selected.lineIds.map((id) => ({ id, ...(LINE_INFO_BY_ID.get(id) ?? { name: id, color: '#888' }) }))}
          upcomingTrains={getUpcomingTrains(selected.name, tracks, trainsByTrack, 6)}
          onClose={() => setSelectedStation(null)}
        />
      )}

      <button
        type="button"
        onClick={() => setLegendOpen(true)}
        className="absolute bottom-3 right-3 z-10 rounded-full border border-white/15 bg-[#0d1117]/90 px-3 py-2 text-xs font-medium text-white shadow-lg"
      >
        노선 범례
      </button>

      {!rider && (
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="absolute top-3 right-3 z-10 rounded-full border border-white/15 bg-[#0d1117]/90 px-3 py-2 text-xs font-medium text-white shadow-lg"
        >
          🔍 역 검색
        </button>
      )}

      {rider && (
        <button
          type="button"
          onClick={() => setFocusEnabled((v) => !v)}
          className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium shadow-lg"
          style={{
            borderColor: focusEnabled ? '#ff9500' : 'rgba(255,255,255,0.15)',
            background: focusEnabled ? '#ff9500' : 'rgba(13,17,23,0.9)',
            color: '#ffffff',
          }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: focusEnabled ? '#ffffff' : '#8b949e' }} />
          포커스 {focusEnabled ? 'ON' : 'OFF'}
        </button>
      )}

      {legendOpen && <LineLegend onClose={() => setLegendOpen(false)} />}

      {searchOpen && (
        <StationSearch
          stations={stations}
          onClose={() => setSearchOpen(false)}
          onSelect={(s) => {
            setSearchOpen(false)
            setSelectedStation(s.name)
            jumpToStation(s.x, s.y)
          }}
        />
      )}
    </div>
  )
}
