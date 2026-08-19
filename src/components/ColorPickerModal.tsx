import { useRef, useState } from 'react'
import { isValidHexColor, getContrastTextColor, hexToHsv, hsvToHex, type HSV } from '../utils/color'

interface ColorPickerModalProps {
  initialColor: string
  onApply: (hex: string) => void
  onClose: () => void
}

export function ColorPickerModal({ initialColor, onApply, onClose }: ColorPickerModalProps) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(isValidHexColor(initialColor) ? initialColor : '#ffffff'))
  const [hexInput, setHexInput] = useState(initialColor)
  const [error, setError] = useState(false)
  const color = hsvToHex(hsv.h, hsv.s, hsv.v)

  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<'sv' | 'hue' | null>(null)

  const updateFromHsv = (next: HSV) => {
    setHsv(next)
    setHexInput(hsvToHex(next.h, next.s, next.v))
    setError(false)
  }

  const applySvFromPointer = (clientX: number, clientY: number) => {
    const rect = svRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    updateFromHsv({ h: hsv.h, s: x, v: 1 - y })
  }

  const applyHueFromPointer = (clientX: number) => {
    const rect = hueRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    updateFromHsv({ h: x * 360, s: hsv.s, v: hsv.v })
  }

  const onSvDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragging.current = 'sv'
    applySvFromPointer(e.clientX, e.clientY)
  }
  const onHueDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragging.current = 'hue'
    applyHueFromPointer(e.clientX)
  }
  const onDragMove = (e: React.PointerEvent) => {
    if (dragging.current === 'sv') applySvFromPointer(e.clientX, e.clientY)
    else if (dragging.current === 'hue') applyHueFromPointer(e.clientX)
  }
  const onDragEnd = () => {
    dragging.current = null
  }

  const handleHexChange = (value: string) => {
    setHexInput(value)
    const normalized = value.startsWith('#') ? value : `#${value}`
    if (isValidHexColor(normalized)) {
      setHsv(hexToHsv(normalized))
      setError(false)
    } else {
      setError(true)
    }
  }

  const hueColor = `hsl(${hsv.h}, 100%, 50%)`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <h2 className="mb-4 text-center font-medium text-[var(--text-primary)]">화면색 설정</h2>

        {/* 채도(가로) / 명도(세로) 팔레트 — 점을 찍어서 색을 고른다 */}
        <div
          ref={svRef}
          onPointerDown={onSvDown}
          className="relative mb-3 aspect-square w-full touch-none rounded-lg"
          style={{
            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${hueColor}`,
          }}
        >
          <div
            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
              background: color,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4)',
            }}
          />
        </div>

        {/* 색상(Hue) 슬라이더 */}
        <div
          ref={hueRef}
          onPointerDown={onHueDown}
          className="relative mb-4 h-4 w-full touch-none rounded-full"
          style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
        >
          <div
            className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{ left: `${(hsv.h / 360) * 100}%`, background: hueColor, boxShadow: '0 0 0 1px rgba(0,0,0,0.5)' }}
          />
        </div>

        <div
          className="mb-4 flex h-12 items-center justify-center rounded-lg font-digital text-sm"
          style={{ background: color, color: getContrastTextColor(color) }}
        >
          미리보기
        </div>

        <label className="mb-1 block text-xs text-[var(--text-secondary)]">색 코드 (hex)</label>
        <input
          type="text"
          value={hexInput}
          onChange={(e) => handleHexChange(e.target.value)}
          placeholder="#ffffff"
          className="mb-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-[var(--text-primary)] outline-none"
        />
        {error && <p className="mb-2 text-xs text-red-400">올바른 hex 색 코드를 입력하세요 (예: #ffffff)</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--border)] py-2 text-[var(--text-secondary)]"
          >
            취소
          </button>
          <button
            type="button"
            disabled={error}
            onClick={() => onApply(color)}
            className="flex-1 rounded-lg py-2 font-medium disabled:opacity-40"
            style={{ background: color, color: getContrastTextColor(color) }}
          >
            적용
          </button>
        </div>
      </div>
    </div>
  )
}
