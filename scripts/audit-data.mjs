#!/usr/bin/env node
/**
 * 노선 데이터(src/data/raw/*.json)의 정합성을 검사한다.
 * 노선을 추가하거나 lineBends.json/stationCoords.json을 재생성한 뒤 항상 이 스크립트로 확인할 것 —
 * 이 세션에서 실제로 겪은 회귀들(순환선 이음매 곡선 왜곡, 좌표 누락, 노선 간 이름 불일치로 환승 인식 실패)을
 * 자동으로 잡아내기 위한 스크립트다. 문제가 있으면 0이 아닌 코드로 종료한다.
 *
 * 사용: node scripts/audit-data.mjs  (또는 npm run audit)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = join(__dirname, '..', 'src', 'data', 'raw')
const RAW_FILES = ['seoulMetro1to8', 'seoulLightRail', 'korailLines', 'privateAndGtxLines', 'extraLines']

function readJson(name) {
  return JSON.parse(readFileSync(join(RAW_DIR, `${name}.json`), 'utf-8'))
}

const allLines = RAW_FILES.flatMap((f) => readJson(f))
const coords = readJson('stationCoords')
const lineBends = readJson('lineBends')

/** 그래프상 나머지 노선망과 전혀 연결되지 않아도 정상인(실제로 그런) 노선의 예외 목록.
 *  지금은 없음 — 전에는 의정부경전철이 여기 있었는데, 1호선 경원선 구간(회룡역 포함)을 보강하면서
 *  실제로 연결되어 자연히 해소됐다. 새로 노선을 추가하다 여기서 실패하면, 정말 고립된 노선인지
 *  아니면 데이터 공백(누락된 환승역)인지부터 확인할 것. */
const KNOWN_DISCONNECTED_LINE_IDS = new Set()

let problems = 0
function fail(msg) {
  console.error(`✗ ${msg}`)
  problems++
}
function ok(msg) {
  console.log(`✓ ${msg}`)
}

// ---------- 1. 좌표 누락 검사 ----------
{
  const missing = []
  for (const line of allLines) {
    for (const s of line.mainStops) if (!coords[s.stationName]) missing.push(`${line.id}: ${s.stationName}`)
    for (const b of line.branches ?? []) {
      if (!coords[b.fromStationName]) missing.push(`${line.id}/${b.label}(from): ${b.fromStationName}`)
      for (const s of b.stops) if (!coords[s.stationName]) missing.push(`${line.id}/${b.label}: ${s.stationName}`)
    }
  }
  if (missing.length > 0) fail(`좌표 누락 ${missing.length}건:\n  ${missing.join('\n  ')}`)
  else ok('모든 역에 좌표가 있음')
}

// ---------- 2. 노선망 연결성 검사(고립된 노선 탐지) ----------
{
  const adj = new Map()
  const addEdge = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a).add(b)
    adj.get(b).add(a)
  }
  for (const line of allLines) {
    const names = line.mainStops.map((s) => s.stationName)
    for (let i = 1; i < names.length; i++) addEdge(names[i - 1], names[i])
    for (const b of line.branches ?? []) {
      const bnames = [b.fromStationName, ...b.stops.map((s) => s.stationName)]
      for (let i = 1; i < bnames.length; i++) addEdge(bnames[i - 1], bnames[i])
    }
  }
  const visited = new Set()
  const components = []
  for (const node of adj.keys()) {
    if (visited.has(node)) continue
    const comp = []
    const stack = [node]
    visited.add(node)
    while (stack.length) {
      const cur = stack.pop()
      comp.push(cur)
      for (const nb of adj.get(cur)) if (!visited.has(nb)) { visited.add(nb); stack.push(nb) }
    }
    components.push(comp)
  }
  components.sort((a, b) => b.length - a.length)
  const unexpected = components.slice(1).filter((comp) => {
    // 이 컴포넌트가 전부 "알려진 고립 노선"의 역들로만 이루어져 있으면 정상.
    const stationToLine = new Map()
    for (const line of allLines) {
      for (const s of line.mainStops) if (!stationToLine.has(s.stationName)) stationToLine.set(s.stationName, line.id)
      for (const b of line.branches ?? []) for (const s of b.stops) if (!stationToLine.has(s.stationName)) stationToLine.set(s.stationName, line.id)
    }
    return !comp.every((name) => KNOWN_DISCONNECTED_LINE_IDS.has(stationToLine.get(name)))
  })
  if (unexpected.length > 0) {
    fail(`나머지 노선망과 연결되지 않은 예상 밖의 역 그룹 ${unexpected.length}개: ${unexpected.map((c) => c.slice(0, 5).join(',') + (c.length > 5 ? '...' : '')).join(' / ')}`)
  } else {
    ok(`노선망 연결성 정상 (연결 요소 ${components.length}개, 예상된 고립 노선 제외 나머지는 전부 하나로 연결됨)`)
  }
}

// ---------- 3. 지그재그(급격한 꺾임) 검사 ----------
{
  function angle(p0, p1) {
    return Math.atan2(p1[1] - p0[1], p1[0] - p0[0])
  }
  function angleDiffDeg(a1, a2) {
    let d = ((a2 - a1) * 180) / Math.PI
    while (d > 180) d -= 360
    while (d < -180) d += 360
    return Math.abs(d)
  }
  function checkSeq(label, names) {
    const pts = names.map((n) => coords[n]).filter(Boolean)
    const bad = []
    for (let i = 1; i < pts.length - 1; i++) {
      const diff = angleDiffDeg(angle(pts[i - 1], pts[i]), angle(pts[i], pts[i + 1]))
      if (diff > 130) bad.push(`${label}: ${names[i - 1]} -> ${names[i]} -> ${names[i + 1]} (${diff.toFixed(0)}도)`)
    }
    return bad
  }
  let bad = []
  for (const line of allLines) {
    bad.push(...checkSeq(line.name, line.mainStops.map((s) => s.stationName)))
    for (const b of line.branches ?? []) bad.push(...checkSeq(`${line.name}/${b.label}`, [b.fromStationName, ...b.stops.map((s) => s.stationName)]))
  }
  if (bad.length > 0) fail(`130도 이상 급격한 꺾임 ${bad.length}건:\n  ${bad.join('\n  ')}`)
  else ok('급격한 꺾임(지그재그) 없음')
}

// ---------- 4. 곡선(bend) 데이터 이상치 검사 — 순환선 이음매 wrap-around 회귀 감지 ----------
{
  const suspicious = []
  function checkBends(lineId, label, bends) {
    for (const b of bends ?? []) {
      if (b && b.length > 100) suspicious.push(`${lineId}/${label}: bend point ${b.length}개 (비정상적으로 긺 — 순환선 이음매 wrap-around 버그일 가능성)`)
    }
  }
  for (const [lineId, data] of Object.entries(lineBends)) {
    checkBends(lineId, 'main', data.main)
    for (const [label, bends] of Object.entries(data.branches ?? {})) checkBends(lineId, label, bends)
  }
  if (suspicious.length > 0) fail(`곡선 데이터 이상치 ${suspicious.length}건:\n  ${suspicious.join('\n  ')}`)
  else ok('곡선 데이터에 이상치 없음')
}

// ---------- 5. 역 이름 표기 일관성 검사 ("역" 접미사) ----------
{
  const withYeok = []
  for (const line of allLines) {
    for (const s of line.mainStops) if (s.stationName.endsWith('역') && s.stationName !== '서울역') withYeok.push(`${line.id}: ${s.stationName}`)
    for (const b of line.branches ?? []) for (const s of b.stops) if (s.stationName.endsWith('역') && s.stationName !== '서울역') withYeok.push(`${line.id}/${b.label}: ${s.stationName}`)
  }
  if (withYeok.length > 0) fail(`"역" 접미사가 붙은 역명 ${withYeok.length}건(서울역 제외 — 오타 의심):\n  ${withYeok.join('\n  ')}`)
  else ok('역명 표기 일관성 정상 ("서울역" 외에는 "역" 접미사 없음)')
}

console.log('')
if (problems > 0) {
  console.error(`${problems}개 항목에서 문제 발견`)
  process.exit(1)
} else {
  console.log('전체 데이터 정합성 검사 통과')
}
