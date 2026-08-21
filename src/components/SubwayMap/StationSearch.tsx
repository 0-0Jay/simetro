import { useMemo, useState } from 'react'
import type { MapStation } from './mapData'

interface StationSearchProps {
  stations: MapStation[]
  onSelect: (station: MapStation) => void
  onClose: () => void
}

export function StationSearch({ stations, onSelect, onClose }: StationSearchProps) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    return stations.filter((s) => s.name.includes(q)).slice(0, 20)
  }, [query, stations])

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-black/60" onClick={onClose}>
      <div
        className="mt-[max(env(safe-area-inset-top),0.75rem)] flex flex-col gap-2 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-[#0d1117] px-3 py-2 shadow-2xl">
          <span className="text-gray-400">🔍</span>
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="역 이름 검색"
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
          />
          <button type="button" onClick={onClose} className="text-sm text-gray-400" aria-label="닫기">
            ✕
          </button>
        </div>

        {results.length > 0 && (
          <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-white/15 bg-[#0d1117] shadow-2xl">
            {results.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => onSelect(s)}
                className="flex w-full items-center justify-between border-b border-white/10 px-3 py-2.5 text-left text-sm text-white last:border-b-0"
              >
                <span className={s.isTransfer ? 'font-bold' : 'font-medium'}>{s.name}</span>
                {s.isTransfer && <span className="text-[10px] text-gray-400">환승역</span>}
              </button>
            ))}
          </div>
        )}
        {query.trim() && results.length === 0 && (
          <p className="rounded-xl bg-[#0d1117]/90 px-3 py-2 text-sm text-gray-400 shadow-2xl">일치하는 역이 없습니다.</p>
        )}
      </div>
    </div>
  )
}
