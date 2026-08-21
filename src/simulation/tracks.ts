import type { LineStop, SubwayLine, ExpressService } from '../data/types'
import { SUBWAY_LINES } from '../data/lines'
import lineBendsRaw from '../data/raw/lineBends.json'
import { EXPRESS_DWELL_BONUS_SEC, MIN_EXPRESS_SEGMENT_SEC } from './engine'

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
  /** 급행이 실제로 정차하는 stops 인덱스 집합. 없으면 이 트랙엔 급행 서비스가 없음(완행만 운행). */
  expressStopIndices?: Set<number>
  /** 완행이 급행에게 순서를 양보(대피)할 수 있는 stops 인덱스 집합. */
  passingStationIndices?: Set<number>
  /** 급행 전용 구간 소요시간(정차역은 segmentSec와 동일, 통과역은 정차 시간만큼 단축). expressStopIndices가 있을 때만 존재. */
  expressSegmentSec?: number[]
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

/** express 데이터(역 이름 기준)를 이 방향의 stops 인덱스 기준으로 변환하고, 급행 전용 구간 소요시간을 계산한다. */
function buildExpressFields(
  stops: TrackStop[],
  segmentSec: number[],
  express: ExpressService | undefined,
): Pick<Track, 'expressStopIndices' | 'passingStationIndices' | 'expressSegmentSec'> {
  if (!express) return {}

  // 시발역/종점역은 서비스 종류와 무관하게 항상 정차하므로, 데이터에 명시가 빠져 있어도 항상 포함시킨다.
  const stopNames = new Set(express.stopStationNames)
  stopNames.add(stops[0].name)
  stopNames.add(stops[stops.length - 1].name)
  const expressStopIndices = new Set<number>()
  stops.forEach((s, i) => {
    if (stopNames.has(s.name)) expressStopIndices.add(i)
  })

  const passingNames = new Set(express.passingStationNames)
  const passingStationIndices = new Set<number>()
  stops.forEach((s, i) => {
    if (passingNames.has(s.name)) passingStationIndices.add(i)
  })

  const expressSegmentSec = segmentSec.map((sec, i) => {
    const arrivingIndex = i + 1 // segmentSec[i]는 stops[i] -> stops[i+1] 구간
    if (expressStopIndices.has(arrivingIndex)) return sec // 정차역: 완행과 동일하게 정차 시간을 쓴다
    return Math.max(MIN_EXPRESS_SEGMENT_SEC, sec - EXPRESS_DWELL_BONUS_SEC) // 통과역: 정차에 드는 시간만큼 단축
  })

  return { expressStopIndices, passingStationIndices, expressSegmentSec }
}

function buildDirectionTracks(
  baseId: string,
  line: SubwayLine,
  branchLabel: string | undefined,
  stops: LineStop[],
  rawBends: ([number, number][] | null)[],
  express: ExpressService | undefined,
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
      ...buildExpressFields(fwdStops, fwdSeg, express),
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
      ...buildExpressFields(bwdStops, bwdSeg, express),
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
      tracks.push(...buildDirectionTracks(`${line.id}-main`, line, undefined, line.mainStops, mainBends, line.express))
    }
    for (const branch of line.branches ?? []) {
      const fromStop = line.mainStops.find((s) => s.stationName === branch.fromStationName)
      if (!fromStop || branch.stops.length === 0) continue
      const branchStops: LineStop[] = [
        { stationName: fromStop.stationName, cumulativeKm: fromStop.cumulativeKm, travelTimeSec: 0 },
        ...branch.stops,
      ]
      const branchBends = bendData?.branches?.[branch.label] ?? []
      // 급행은 본선에만 적용한다(지선까지 급행이 다니는 경우는 없음).
      tracks.push(...buildDirectionTracks(`${line.id}-${branch.label}`, line, branch.label, branchStops, branchBends, undefined))
    }
  }
  return tracks
}
