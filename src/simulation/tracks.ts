import type { LineStop, SubwayLine } from '../data/types'
import { SUBWAY_LINES } from '../data/lines'
import lineBendsRaw from '../data/raw/lineBends.json'

export interface TrackStop {
  name: string
  cumulativeKm: number
}

export type TrackDirection = 'fwd' | 'bwd'

export interface Track {
  id: string
  lineId: string
  lineName: string
  color: string
  direction: TrackDirection
  /** 지선인 경우 지선 이름 (본선은 undefined) */
  branchLabel?: string
  stops: TrackStop[]
  /** stops[i] -> stops[i+1] 소요시간(초). length = stops.length - 1 */
  segmentSec: number[]
  /** stops[i] -> stops[i+1] 사이의 실제 곡선 중간점(nuua 노선도 기반). 없으면 빈 배열(직선). length = stops.length - 1 */
  segmentBends: [number, number][][]
  /** 첫 역과 마지막 역이 같은 순환선(예: 2호선, 6호선 응암순환)인지. true면 종점 소멸 없이 계속 순환한다. */
  isLoop: boolean
}

interface LineBendData {
  main: ([number, number][] | null)[]
  branches: Record<string, ([number, number][] | null)[]>
}
const LINE_BENDS = lineBendsRaw as unknown as Record<string, LineBendData>

function toTrackStops(stops: LineStop[]): TrackStop[] {
  return stops.map((s) => ({ name: s.stationName, cumulativeKm: s.cumulativeKm }))
}

/** stops[0]의 travelTimeSec(시발역, 항상 0)은 쓰지 않고, stops[i>=1]의 travelTimeSec을 세그먼트 시간으로 사용 */
function segmentsFrom(stops: LineStop[]): number[] {
  return stops.slice(1).map((s) => s.travelTimeSec)
}

function buildDirectionTracks(
  baseId: string,
  line: SubwayLine,
  branchLabel: string | undefined,
  stops: LineStop[],
  rawBends: ([number, number][] | null)[],
): Track[] {
  const fwdStops = toTrackStops(stops)
  const fwdSeg = segmentsFrom(stops)
  const fwdBends = fwdStops.slice(1).map((_, i) => rawBends[i] ?? [])
  const bwdStops = [...fwdStops].reverse()
  const bwdSeg = [...fwdSeg].reverse()
  const bwdBends = [...fwdBends].reverse().map((b) => [...b].reverse())
  const isLoop = fwdStops.length > 2 && fwdStops[0].name === fwdStops[fwdStops.length - 1].name
  return [
    {
      id: `${baseId}-fwd`,
      lineId: line.id,
      lineName: line.name,
      color: line.color,
      direction: 'fwd',
      branchLabel,
      stops: fwdStops,
      segmentSec: fwdSeg,
      segmentBends: fwdBends,
      isLoop,
    },
    {
      id: `${baseId}-bwd`,
      lineId: line.id,
      lineName: line.name,
      color: line.color,
      direction: 'bwd',
      branchLabel,
      stops: bwdStops,
      segmentSec: bwdSeg,
      segmentBends: bwdBends,
      isLoop,
    },
  ]
}

/** 노선 데이터를 실제 열차가 오가는 트랙(상행/하행, 지선 포함) 목록으로 변환한다. */
export function buildTracks(lines: SubwayLine[] = SUBWAY_LINES): Track[] {
  const tracks: Track[] = []
  for (const line of lines) {
    const bendData = LINE_BENDS[line.id]
    if (line.mainStops.length >= 2) {
      const mainBends = bendData?.main ?? []
      tracks.push(...buildDirectionTracks(`${line.id}-main`, line, undefined, line.mainStops, mainBends))
    }
    for (const branch of line.branches ?? []) {
      const fromStop = line.mainStops.find((s) => s.stationName === branch.fromStationName)
      if (!fromStop || branch.stops.length === 0) continue
      const branchStops: LineStop[] = [
        { stationName: fromStop.stationName, cumulativeKm: fromStop.cumulativeKm, travelTimeSec: 0 },
        ...branch.stops,
      ]
      const branchBends = bendData?.branches?.[branch.label] ?? []
      tracks.push(...buildDirectionTracks(`${line.id}-${branch.label}`, line, branch.label, branchStops, branchBends))
    }
  }
  return tracks
}
