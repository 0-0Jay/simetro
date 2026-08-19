/** hex(#rgb, #rrggbb) 색상의 상대휘도를 계산해 대비가 좋은 텍스트 색(검/흰)을 고른다. WCAG relative luminance 공식 사용. */
export function getContrastTextColor(hex: string): '#000000' | '#ffffff' {
  const { r, g, b } = hexToRgb(hex)
  const toLinear = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return luminance > 0.4 ? '#000000' : '#ffffff'
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '')
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const num = Number.parseInt(h, 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

export function isValidHexColor(hex: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)
}

export interface HSV {
  h: number
  s: number
  v: number
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

export function hexToHsv(hex: string): HSV {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHsv(r, g, b)
}

export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let rp = 0
  let gp = 0
  let bp = 0
  if (h < 60) [rp, gp, bp] = [c, x, 0]
  else if (h < 120) [rp, gp, bp] = [x, c, 0]
  else if (h < 180) [rp, gp, bp] = [0, c, x]
  else if (h < 240) [rp, gp, bp] = [0, x, c]
  else if (h < 300) [rp, gp, bp] = [x, 0, c]
  else [rp, gp, bp] = [c, 0, x]
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  }
}

export function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v)
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function mix(hexA: string, hexB: string, t: number): string {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  const r = Math.round(a.r + (b.r - a.r) * t)
  const g = Math.round(a.g + (b.g - a.g) * t)
  const bl = Math.round(a.b + (b.b - a.b) * t)
  const toHex = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`
}

export interface ThemePalette {
  bg: string
  bgPanel: string
  border: string
  textPrimary: string
  textSecondary: string
}

/** 선택한 색을 앱 전체 배경색으로 삼고, 그로부터 패널/테두리/본문·보조 텍스트 색을 파생시킨다. */
export function deriveThemePalette(hex: string): ThemePalette {
  const textPrimary = getContrastTextColor(hex)
  return {
    bg: hex,
    bgPanel: mix(hex, textPrimary, 0.1),
    border: mix(hex, textPrimary, 0.22),
    textPrimary,
    textSecondary: mix(textPrimary, hex, 0.42),
  }
}
