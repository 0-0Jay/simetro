import stationCoords from './raw/stationCoords.json'

const COORDS = stationCoords as unknown as Record<string, [number, number]>

/** 스키매틱 지도 좌표계 전체 범위 (1~9호선 배치 기준) */
export const MAP_VIEWBOX = { minX: 80, minY: 80, width: 2880, height: 2080 }

export function getStationCoord(name: string): [number, number] | undefined {
  return COORDS[name]
}

export function hasCoord(name: string): boolean {
  return name in COORDS
}
