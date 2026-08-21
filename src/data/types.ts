export type DataConfidence = 'official' | 'approximate'

export interface LineStop {
  /** 환승역 판별에 쓰이는 정규화된 역 이름 (다른 노선과 이름이 같으면 같은 역=환승역으로 취급) */
  stationName: string
  /** 노선 기점으로부터의 누적거리 (km, 지선은 분기역 기준 재계산하지 않고 참고용으로만 사용) */
  cumulativeKm: number
  /** 이전 역에서 이 역까지 걸리는 실제 소요시간(초). 게임 클럭(gameSeconds)에서 그대로 1:1로 사용된다. */
  travelTimeSec: number
}

export interface LineBranch {
  /** 분기가 시작되는 본선 역 이름 */
  fromStationName: string
  /** 지선 이름 (예: "성수지선") */
  label: string
  stops: LineStop[]
}

export interface ExpressService {
  /** 급행이 실제로 정차하는 역 이름(본선 기준, 순서 무관 — 시발/종점은 자동으로 포함된 것으로 간주). */
  stopStationNames: string[]
  /** 완행이 급행에게 순서를 양보(대피)할 수 있는 역 이름(실제 대피선/추월선이 있는 역). */
  passingStationNames: string[]
}

export interface SubwayLine {
  id: string
  name: string
  color: string
  operator: string
  dataConfidence: DataConfidence
  /** 대략적인 첫차/막차 시각 (HH:MM, 24시 이후는 25:00 형식으로 다음날 새벽을 표현) */
  firstTrain: string
  lastTrain: string
  /** 기점→종점 순서의 본선 역 목록 (첫 역은 travelTimeSec=0) */
  mainStops: LineStop[]
  branches?: LineBranch[]
  /** 순환선인 경우 true (예: 2호선 본선) */
  isLoop?: boolean
  /** 이 노선에 급행 서비스가 있으면 정차 패턴/대피역 정보 (본선에만 적용). */
  express?: ExpressService
  /** 데이터 출처/한계에 대한 메모 (근사치 처리한 구간 등) */
  notes?: string
}
