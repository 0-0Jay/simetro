import { SUBWAY_LINES } from '../../data/lines'

/** 실제 서울/수도권 지하철 노선도 범례 관행을 따라, 숫자 노선은 번호, 그 외는 짧은 약칭 배지를 쓴다. */
const BADGE_LABEL: Record<string, string> = {
  line1: '1',
  line2: '2',
  line3: '3',
  line4: '4',
  line5: '5',
  line6: '6',
  line7: '7',
  line8: '8',
  line9: '9',
  ui: '우이',
  sinlim: '신림',
  gyeonguijungang: '경의',
  suinbundang: '수인',
  gyeongchun: '경춘',
  airport: '공항',
  'gtxa-north': 'GTX',
  'gtxa-south': 'GTX',
  incheon1: '인천1',
  incheon2: '인천2',
  sinbundang: '신분',
  gyeonggang: '경강',
  seohae: '서해',
  uijeongbuLrt: '의정부',
  yonginEverline: '용인',
  incheonMaglev: '자기\n부상',
  gimpoGoldline: '김포',
}

interface LineLegendProps {
  onClose: () => void
}

export function LineLegend({ onClose }: LineLegendProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/50 p-3" onClick={onClose}>
      <div
        className="max-h-[70%] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-[#0d1117] p-4 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-bold">노선 범례</span>
          <button type="button" onClick={onClose} className="text-sm text-gray-400" aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {SUBWAY_LINES.map((line) => (
            <div key={line.id} className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center whitespace-pre-line rounded-full text-center text-[9px] font-bold leading-tight"
                style={{ background: line.color, color: '#ffffff' }}
              >
                {BADGE_LABEL[line.id] ?? line.name.slice(0, 2)}
              </span>
              <span className="text-xs leading-tight text-gray-200">{line.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
