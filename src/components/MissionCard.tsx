import type { Mission } from '../simulation/missionGenerator'

interface MissionCardProps {
  mission: Mission
  disabled: boolean
  completed: boolean
  onStart: () => void
}

export function MissionCard({ mission, disabled, completed, onStart }: MissionCardProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-primary)]">
        {mission.waypoints.map((name, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-[var(--text-secondary)]">→</span>}
            <span className={i === 0 || i === mission.waypoints.length - 1 ? 'font-medium' : ''}>{name}</span>
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[var(--text-primary)]" aria-label={`난이도 ${mission.difficulty}`}>
          {'★'.repeat(mission.difficulty)}
          <span className="text-[var(--border)]">{'★'.repeat(3 - mission.difficulty)}</span>
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={onStart}
          className="rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-40"
          style={{ background: 'var(--text-primary)', color: 'var(--bg)' }}
        >
          {completed ? '완료' : '출발'}
        </button>
      </div>
    </div>
  )
}
