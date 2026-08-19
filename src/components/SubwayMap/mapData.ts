import { getStationCoord } from '../../data/coordinates'
import { buildTracks } from '../../simulation/tracks'
import { SUBWAY_LINES } from '../../data/lines'

export interface MapLineSegment {
  key: string
  lineId: string
  color: string
  points: [number, number][]
}

export interface MapStation {
  name: string
  x: number
  y: number
  lineIds: string[]
  isTransfer: boolean
}

export function buildMapData(): { segments: MapLineSegment[]; stations: MapStation[] } {
  const tracks = buildTracks(SUBWAY_LINES).filter((t) => t.direction === 'fwd')
  const segments: MapLineSegment[] = []
  const stationMap = new Map<string, MapStation>()

  function addStation(name: string, x: number, y: number, lineId: string) {
    const existing = stationMap.get(name)
    if (existing) {
      if (!existing.lineIds.includes(lineId)) existing.lineIds.push(lineId)
      existing.isTransfer = existing.lineIds.length > 1
    } else {
      stationMap.set(name, { name, x, y, lineIds: [lineId], isTransfer: false })
    }
  }

  for (const track of tracks) {
    const coords = track.stops.map((s) => getStationCoord(s.name))
    if (coords.some((c) => !c)) continue // 아직 좌표가 없는 노선은 지도에서 제외

    const points: [number, number][] = [coords[0]!]
    for (let i = 0; i < track.segmentBends.length; i++) {
      points.push(...track.segmentBends[i])
      points.push(coords[i + 1]!)
    }
    segments.push({ key: track.id, lineId: track.lineId, color: track.color, points })
    track.stops.forEach((s, i) => addStation(s.name, coords[i]![0], coords[i]![1], track.lineId))
  }

  return { segments, stations: [...stationMap.values()] }
}
