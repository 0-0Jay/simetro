/** 외부 음원 파일 없이 WebAudio로 짧은 효과음을 즉석에서 만들어 재생한다. */
let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!audioCtx) audioCtx = new Ctor()
  if (audioCtx.state === 'suspended') void audioCtx.resume()
  return audioCtx
}

function beep(freq: number, startDelaySec: number, durationSec: number, volume: number) {
  const ctx = getCtx()
  if (!ctx) return
  const startAt = ctx.currentTime + startDelaySec
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(volume, startAt)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(startAt)
  osc.stop(startAt + durationSec)
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern)
}

export function playBoardSound() {
  beep(660, 0, 0.09, 0.12)
  vibrate(25)
}

export function playAlightSound() {
  beep(520, 0, 0.09, 0.12)
  vibrate(25)
}

export function playDelaySound() {
  beep(220, 0, 0.22, 0.12)
  vibrate([40, 40, 40])
}

export function playCompleteSound() {
  beep(523, 0, 0.1, 0.14)
  beep(659, 0.1, 0.1, 0.14)
  beep(784, 0.2, 0.2, 0.14)
  vibrate([40, 30, 40, 30, 120])
}
