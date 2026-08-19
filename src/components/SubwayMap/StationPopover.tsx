interface StationPopoverProps {
  x: number
  y: number
  scale: number
  stationName: string
  lines: { id: string; name: string; color: string }[]
  onClose: () => void
}

/**
 * 역 클릭 시 뜨는 정보창. 지도와 같은 <g transform> 안에 렌더링되지만,
 * scale의 역수로 다시 스케일링해서 줌 배율과 무관하게 항상 같은 화면 크기를 유지한다.
 */
export function StationPopover({ x, y, scale, stationName, lines, onClose }: StationPopoverProps) {
  const width = Math.max(90, 16 + stationName.length * 13)
  const rowHeight = 15
  const height = 34 + lines.length * rowHeight

  return (
    <g transform={`translate(${x} ${y - 12}) scale(${1 / scale})`} onClick={(e) => e.stopPropagation()}>
      <g transform={`translate(${-width / 2} ${-height})`}>
        <rect
          width={width}
          height={height}
          rx={8}
          fill="#0d1117"
          stroke="#ffffff"
          strokeWidth={1.2}
          fillOpacity={0.95}
        />
        <text x={width / 2} y={18} textAnchor="middle" fontSize={13} fontWeight={700} fill="#ffffff">
          {stationName}
        </text>
        {lines.map((line, i) => (
          <g key={line.id} transform={`translate(10 ${30 + i * rowHeight})`}>
            <circle cx={4} cy={-4} r={4} fill={line.color} />
            <text x={13} y={0} fontSize={10} fill="#d7dde3">
              {line.name}
            </text>
          </g>
        ))}
        <text
          x={width - 8}
          y={14}
          textAnchor="end"
          fontSize={11}
          fill="#8b949e"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
        >
          ✕
        </text>
      </g>
    </g>
  )
}
