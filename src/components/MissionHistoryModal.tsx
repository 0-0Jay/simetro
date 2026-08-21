import { useMemo, useState } from 'react'
import { useMissionStore, type MissionRecord } from '../store/missionStore'
import { useSimulationStore } from '../store/simulationStore'
import { getAllStationNames } from '../simulation/routeGraph'
import { todayKey } from '../simulation/missionGenerator'
import { formatDuration } from '../utils/time'

interface MissionHistoryModalProps {
  onClose: () => void
}

type SortDir = 'asc' | 'desc'

interface MissionStats {
  totalCount: number
  totalSec: number
  bestSec: number | null
  countByDifficulty: Record<1 | 2 | 3, number>
  streakDays: number
}

function computeStats(history: MissionRecord[]): MissionStats {
  const countByDifficulty: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 }
  let totalSec = 0
  let bestSec: number | null = null
  const completedDays = new Set<string>()

  for (const r of history) {
    totalSec += r.elapsedSec
    if (bestSec === null || r.elapsedSec < bestSec) bestSec = r.elapsedSec
    countByDifficulty[r.difficulty]++
    completedDays.add(todayKey(new Date(r.completedAtIso)))
  }

  let streakDays = 0
  const cursor = new Date()
  while (completedDays.has(todayKey(cursor))) {
    streakDays++
    cursor.setDate(cursor.getDate() - 1)
  }

  return { totalCount: history.length, totalSec, bestSec, countByDifficulty, streakDays }
}

export function MissionHistoryModal({ onClose }: MissionHistoryModalProps) {
  const missionHistory = useMissionStore((s) => s.missionHistory)
  const retryMission = useMissionStore((s) => s.retryMission)
  const activeMission = useMissionStore((s) => s.activeMission)
  const gameSeconds = useSimulationStore((s) => s.gameSeconds)

  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [difficulty, setDifficulty] = useState<0 | 1 | 2 | 3>(0)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const stationNames = useMemo(() => getAllStationNames(), [])
  const stats = useMemo(() => computeStats(missionHistory), [missionHistory])

  const filtered = useMemo(() => {
    const list = missionHistory.filter((r) => {
      if (origin && r.waypoints[0] !== origin) return false
      if (dest && r.waypoints[r.waypoints.length - 1] !== dest) return false
      if (difficulty !== 0 && r.difficulty !== difficulty) return false
      return true
    })
    list.sort((a, b) => (sortDir === 'asc' ? a.elapsedSec - b.elapsedSec : b.elapsedSec - a.elapsedSec))
    return list
  }, [missionHistory, origin, dest, difficulty, sortDir])

  const handleRetry = (record: MissionRecord) => {
    if (activeMission) return
    retryMission(record, gameSeconds)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-center font-medium text-[var(--text-primary)]">미션 기록 내역</h2>

        {stats.totalCount > 0 && (
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] p-2.5 text-center sm:grid-cols-4">
            <div>
              <p className="text-lg font-bold text-[var(--text-primary)]">{stats.totalCount}</p>
              <p className="text-[10px] text-[var(--text-secondary)]">완료한 미션</p>
            </div>
            <div>
              <p className="text-lg font-bold text-[var(--text-primary)]">{formatDuration(stats.totalSec)}</p>
              <p className="text-[10px] text-[var(--text-secondary)]">누적 소요시간</p>
            </div>
            <div>
              <p className="text-lg font-bold text-[var(--text-primary)]">{stats.bestSec !== null ? formatDuration(stats.bestSec) : '-'}</p>
              <p className="text-[10px] text-[var(--text-secondary)]">최고 기록</p>
            </div>
            <div>
              <p className="text-lg font-bold text-[var(--text-primary)]">{stats.streakDays}일</p>
              <p className="text-[10px] text-[var(--text-secondary)]">연속 플레이</p>
            </div>
            <div className="col-span-2 flex justify-center gap-3 pt-1 sm:col-span-4">
              {([1, 2, 3] as const).map((d) => (
                <span key={d} className="text-xs text-[var(--text-secondary)]">
                  {'★'.repeat(d)} {stats.countByDifficulty[d]}회
                </span>
              ))}
            </div>
          </div>
        )}

        <datalist id="mission-history-stations">
          {stationNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div className="mb-2 flex gap-2">
          <input
            type="text"
            list="mission-history-stations"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="출발역"
            className="w-1/2 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none"
          />
          <input
            type="text"
            list="mission-history-stations"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            placeholder="도착역"
            className="w-1/2 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none"
          />
        </div>

        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {([0, 1, 2, 3] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                className="rounded-lg border px-2.5 py-1 text-xs"
                style={{
                  borderColor: difficulty === d ? 'var(--text-primary)' : 'var(--border)',
                  background: difficulty === d ? 'var(--text-primary)' : 'transparent',
                  color: difficulty === d ? 'var(--bg)' : 'var(--text-secondary)',
                }}
              >
                {d === 0 ? '전체' : '★'.repeat(d)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
          >
            소요시간 {sortDir === 'asc' ? '오름차순 ▲' : '내림차순 ▼'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--text-secondary)]">일치하는 기록이 없습니다.</p>
          )}
          <div className="flex flex-col gap-2">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-lg border border-[var(--border)] p-2.5">
                <div className="mb-1 flex flex-wrap items-center gap-1 text-xs text-[var(--text-primary)]">
                  {r.waypoints.map((name, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-[var(--text-secondary)]">→</span>}
                      <span className={i === 0 || i === r.waypoints.length - 1 ? 'font-medium' : ''}>{name}</span>
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-[var(--text-secondary)]">
                    {'★'.repeat(r.difficulty)} · {formatDuration(r.elapsedSec)} ·{' '}
                    {new Date(r.completedAtIso).toLocaleDateString('ko-KR')}
                  </div>
                  <button
                    type="button"
                    disabled={!!activeMission}
                    onClick={() => handleRetry(r)}
                    className="rounded-lg px-3 py-1 text-xs font-medium disabled:opacity-40"
                    style={{ background: 'var(--text-primary)', color: 'var(--bg)' }}
                  >
                    재도전
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-secondary)]"
        >
          닫기
        </button>
      </div>
    </div>
  )
}
