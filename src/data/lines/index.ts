import type { SubwayLine } from '../types'
import seoulMetro1to8 from '../raw/seoulMetro1to8.json'
import seoulLightRail from '../raw/seoulLightRail.json'
import korailLines from '../raw/korailLines.json'
import privateAndGtxLines from '../raw/privateAndGtxLines.json'
import extraLines from '../raw/extraLines.json'

export const SUBWAY_LINES: SubwayLine[] = [
  ...(seoulMetro1to8 as SubwayLine[]),
  ...(seoulLightRail as SubwayLine[]),
  ...(korailLines as SubwayLine[]),
  ...(privateAndGtxLines as SubwayLine[]),
  ...(extraLines as SubwayLine[]),
]

export function getLineById(id: string): SubwayLine | undefined {
  return SUBWAY_LINES.find((line) => line.id === id)
}
