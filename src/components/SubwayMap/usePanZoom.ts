import { useRef, useState, type RefObject } from 'react'

export interface PanZoomTransform {
  scale: number
  tx: number
  ty: number
}

/* MIN_SCALE=1: svg의 preserveAspectRatio="slice"가 이미 스케일 1에서 화면을 빈틈없이 채우도록 계산해주므로,
   그 아래로 줄이면 다시 빈 여백이 생긴다. 즉 1이 "최대로 축소했을 때 화면 꽉 채우기"의 하한이다. */
const MIN_SCALE = 1
const MAX_SCALE = 10

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

/** SVG 지도의 팬(드래그)/줌(휠, 핀치)을 처리한다. tx/ty/scale은 모두 viewBox 좌표계 단위. */
export function usePanZoom(
  svgRef: RefObject<SVGSVGElement | null>,
  viewBox: { minX: number; minY: number; width: number; height: number },
  initial: PanZoomTransform,
  followPoint?: { x: number; y: number } | null,
) {
  const [transform, setTransform] = useState<PanZoomTransform>(initial)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const lastPinchDist = useRef<number | null>(null)

  function screenDeltaToViewBox(dx: number, dy: number) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { dx: 0, dy: 0 }
    return { dx: (dx / rect.width) * viewBox.width, dy: (dy / rect.height) * viewBox.height }
  }

  function screenPointToViewBox(x: number, y: number) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
    return { x: ((x - rect.left) / rect.width) * viewBox.width, y: ((y - rect.top) / rect.height) * viewBox.height }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      lastPinchDist.current = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const prev = pointers.current.get(e.pointerId)!
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 1) {
      if (followPoint) return // 추적 모드에서는 수동 팬을 무시한다(줌은 계속 허용)
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      const { dx: vdx, dy: vdy } = screenDeltaToViewBox(dx, dy)
      setTransform((t) => ({ ...t, tx: t.tx + vdx, ty: t.ty + vdy }))
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const midScreen = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if (lastPinchDist.current) {
        const factor = dist / lastPinchDist.current
        setTransform((t) => {
          const newScale = clamp(t.scale * factor, MIN_SCALE, MAX_SCALE)
          const pView = screenPointToViewBox(midScreen.x, midScreen.y)
          const localX = (pView.x - t.tx) / t.scale
          const localY = (pView.y - t.ty) / t.scale
          return { scale: newScale, tx: pView.x - newScale * localX, ty: pView.y - newScale * localY }
        })
      }
      lastPinchDist.current = dist
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) lastPinchDist.current = null
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const pView = screenPointToViewBox(e.clientX, e.clientY)
    setTransform((t) => {
      const newScale = clamp(t.scale * factor, MIN_SCALE, MAX_SCALE)
      const localX = (pView.x - t.tx) / t.scale
      const localY = (pView.y - t.ty) / t.scale
      return { scale: newScale, tx: pView.x - newScale * localX, ty: pView.y - newScale * localY }
    })
  }

  // 추적 모드: tx/ty는 상태로 저장하지 않고, followPoint가 항상 화면(=viewBox) 중심에 오도록 매번 계산한다.
  // preserveAspectRatio="xMidYMid ..."는 언제나 viewBox 중심을 화면 중심에 놓으므로,
  // followPoint를 viewBox 중심으로 옮기는 tx/ty를 쓰면 결과적으로 화면 중심에 오게 된다.
  const effectiveTransform: PanZoomTransform = followPoint
    ? {
        scale: transform.scale,
        tx: viewBox.minX + viewBox.width / 2 - followPoint.x * transform.scale,
        ty: viewBox.minY + viewBox.height / 2 - followPoint.y * transform.scale,
      }
    : transform

  return {
    transform: effectiveTransform,
    setTransform,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onWheel },
  }
}
