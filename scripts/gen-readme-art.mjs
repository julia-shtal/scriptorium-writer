// scripts/gen-readme-art.mjs
// Generates the README's visual identity: an animated banner, four 16x16 sprites (each in a
// light and a dark variant) and the 1280x640 GitHub social preview. Art is authored as
// character grids — one char per pixel, each char a palette key — which are then run-length
// packed into one <path> per colour, or rasterised for the PNG.
// Node built-ins only: the palette comes from ./palette.mjs, the PNG encoder from ./png.mjs.
// Usage: `npm run gen:art`, or `node scripts/gen-readme-art.mjs <outDir>` to write elsewhere
// (the test regenerates into a temp dir and diffs it against the committed assets).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'
import { PARCHMENT, PAGE, ACCENT, FRAME, GOLD, EMBER, ICON_INK, INK_NAV, rgba } from './palette.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = process.argv[2] ?? join(HERE, '..', 'assets', 'readme')

// ---------------------------------------------------------------- palette
// F frame  P parchment  p page(light)  I ink  A accent  g gold  e ember  m impressed mark
// `m` is split out of `F` for the seal alone: on light both are the frame colour, but on a
// dark page the shadow rim and the impressed device need opposite treatment (see SPRITE_DARK).
const LIGHT = {
  F: FRAME, P: PARCHMENT, p: PAGE, I: ICON_INK,
  A: ACCENT, g: GOLD, e: EMBER, m: FRAME,
}
// Dim-room variant for GitHub dark mode: same picture, lower light. These stay literal and
// local — they are art direction for the README only, and nothing else in the app uses them.
// This dresses the banner, where every element sits on a dimmed parchment field.
const DARK = {
  F: '#241a12', P: '#d8c7a3', p: '#e8dcc0', I: '#3a2a1d',
  A: '#7a4d24', g: '#967742', e: '#8a3427', m: '#241a12',
}
// Sprites sit directly on the page, with no parchment field behind them, so they need their
// own palette rather than a substitution on DARK. The tonal order inverts — a light outline
// over a *dark* fill, rather than DARK's dark-on-light — because lifting the outline alone
// leaves it the same colour as the fill and the sprite renders as one flat blob. Contrast
// against GitHub's #0d1117: outline 13.9, outline/fill 5.05, fill/page 2.75.
const SPRITE_DARK = {
  I: '#e8dcc0',  // outline
  p: INK_NAV,    // fill — book.css --ink-nav, asserted in scripts/palette.test.ts
  g: GOLD,       // gold, unchanged
  A: ACCENT,
  e: EMBER,      // ember disc, unchanged
  F: GOLD,       // rim: the ember disc clears the page by only 2.81, so there is no room for
                 // a shadow rim beneath it — light-and-shadow modelling is dropped and the
                 // rim goes gold all the way round
  m: '#e8dcc0',  // impressed mark
  P: '#d8c7a3',
}

// ---------------------------------------------------------------- 5x7 titling face
const FONT = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#..#.', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
}

// ---------------------------------------------------------------- grid helpers
const grid = (w, h) => ({ w, h, px: Array.from({ length: h }, () => new Array(w).fill(null)) })
const set = (g, x, y, c) => { if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.px[y][x] = c }

function fill(g, x, y, w, h, c) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) set(g, x + dx, y + dy, c)
}
function outline(g, x, y, w, h, c) {
  for (let dx = 0; dx < w; dx++) { set(g, x + dx, y, c); set(g, x + dx, y + h - 1, c) }
  for (let dy = 0; dy < h; dy++) { set(g, x, y + dy, c); set(g, x + w - 1, y + dy, c) }
}
// '.' is transparent; any other char is a palette key, unless `as` overrides '#'.
function stamp(g, x, y, rows, as = null) {
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
    if (ch !== '.') set(g, x + dx, y + dy, as ?? ch)
  }))
}

function measure(s, gw, sw) {
  let w = 0
  for (const ch of s) w += (ch === ' ' ? sw : gw) + 1
  return w - 1
}
function write(g, x, y, s, face, key, gw, sw) {
  let cx = x
  for (const ch of s) {
    if (ch === ' ') { cx += sw + 1; continue }
    stamp(g, cx, y, face[ch], key)
    cx += gw + 1
  }
}
const titleW = (s) => measure(s, 5, 4)

// ---------------------------------------------------------------- SVG emit
function toRects(g) {
  const runs = []
  for (let y = 0; y < g.h; y++) {
    let x = 0
    while (x < g.w) {
      const c = g.px[y][x]
      if (c === null) { x++; continue }
      let w = 1
      while (x + w < g.w && g.px[y][x + w] === c) w++
      runs.push({ x, y, w, h: 1, c }); x += w
    }
  }
  const out = []; const open = new Map()
  for (const r of runs) {
    const k = `${r.x}:${r.w}:${r.c}`; const prev = open.get(k)
    if (prev !== undefined && out[prev].y + out[prev].h === r.y) out[prev].h += 1
    else open.set(k, out.push({ ...r }) - 1)
  }
  return out
}
// One <path> per colour: far smaller than one <rect> per run.
// Keyed on the *resolved* colour rather than the palette key, so two keys that share a value
// — `m` and `F` on LIGHT — still emit a single path. Keying on the key instead would split
// the light seal into two identically-filled paths and rewrite art nobody asked to change.
function paths(g, pal) {
  const byColor = new Map()
  for (const r of toRects(g)) {
    const hex = pal[r.c]
    const d = `M${r.x} ${r.y}h${r.w}v${r.h}h-${r.w}z`
    byColor.set(hex, (byColor.get(hex) ?? '') + d)
  }
  return [...byColor].map(([hex, d]) => `<path fill="${hex}" d="${d}"/>`).join('')
}

// ---------------------------------------------------------------- open book
// Seen in three-quarter view, receding to the upper left. The spread is a plane: u runs
// across it (-1 left fore-edge, 0 spine, 1 right fore-edge) and v into depth (0 front,
// 1 back), and `lift` raises the leaves out of the gutter. Each surface is swept densely and
// rounded onto the grid, back to front, so a later pass wins where two of them meet.
const BOOK_X = 27 // spine at the front edge
const BOOK_Y = 30
const lift = (u) => 2.4 * Math.sqrt(Math.abs(u))
const flat = (u, v) => [BOOK_X + u * 14 - v * 6, BOOK_Y - u * 2 - v * 10]
const onLeaf = (u, v) => { const [x, y] = flat(u, v); return [x, y - lift(u)] }
const snap = ([x, y]) => [Math.round(x), Math.round(y)]
const sweep = (fn, n = 240) => { for (let i = 0; i <= n; i++) fn(i / n) }

// Text lines sit at these depths, back to front. '#' is ink, '.' a word gap; a line runs
// one pixel per screen column, and columns past the end of its pattern stay blank.
const LINE_V = [0.78, 0.6, 0.42, 0.24]
const OLD_TEXT = ['###.####.##', '#.#####.###', '####.##.###', '####.###.##']
const NEW_TEXT = ['####.###.##', '##.####.###', '#####.#.###', '###.####']

// [x, y, inked] per screen column, following the curve of the leaf.
function lineOn(u0, u1, v, pattern) {
  const px = []
  sweep((a) => {
    const [x, y] = snap(onLeaf(u0 + (u1 - u0) * a, v))
    if (!px.length || px.at(-1)[0] !== x) px.push([x, y])
  }, 400)
  return px.map(([x, y], k) => [x, y, (pattern[k] ?? '.') === '#'])
}
// The right-hand page, which the quill writes.
const LINES = LINE_V.map((v, i) => lineOn(0.14, 0.86, v, NEW_TEXT[i]))

function drawBook(g) {
  // leather boards, three pixels under the page plane
  sweep((a) => sweep((b) => {
    const [x, y] = snap(flat(-1.07 + a * 2.14, -0.04 + b * 1.08))
    set(g, x, y + 3, 'F')
  }, 120), 240)
  // front face of the text block: stacked leaves, page and accent in turn
  sweep((a) => {
    const u = -1 + 2 * a
    const [x, ys] = snap(onLeaf(u, 0))
    const [, yf] = snap(flat(u, 0))
    for (let y = ys + 1; y <= yf + 2; y++) set(g, x, y, (y - ys) % 2 ? 'p' : 'A')
  })
  // left face of the text block, the one turned towards us
  sweep((a) => {
    const [x, ys] = snap(onLeaf(-1, a))
    set(g, x - 1, ys + 1, 'A'); set(g, x - 1, ys + 2, 'A')
  })
  // page surface, back to front, then its outline and the gutter
  sweep((b) => sweep((a) => set(g, ...snap(onLeaf(-1 + 2 * a, 1 - b)), 'p'), 300), 160)
  sweep((a) => {
    const u = -1 + 2 * a
    set(g, ...snap(onLeaf(u, 0)), 'A'); set(g, ...snap(onLeaf(u, 1)), 'A')
  }, 300)
  sweep((a) => {
    set(g, ...snap(onLeaf(-1, a)), 'A'); set(g, ...snap(onLeaf(1, a)), 'A'); set(g, ...snap(onLeaf(0, a)), 'A')
  }, 100)
  // the left-hand page is already written, in faded gold
  LINE_V.forEach((v, i) => lineOn(-0.84, -0.14, v, OLD_TEXT[i]).forEach(([x, y, ink]) => {
    if (ink) set(g, x, y, 'g')
  }))
}

// ---------------------------------------------------------------- quill
// 9x13, leaning up and to the right from the nib at local (0, QUILL_H - 1). Not the 16x16
// quill sprite: this one is drawn at the banner's scale and moves as one piece.
// 13 rows is the ceiling: the hop between the top two lines lifts the nib to y 16, and the
// quill's top must stay on the parchment (y >= 4), clear of the gilt line.
const QUILL_W = 9
const QUILL_H = 13

function quillRows() {
  const m = Array.from({ length: QUILL_H }, () => new Array(QUILL_W).fill('.'))
  const shaftX = (y) => Math.round(((QUILL_H - 1 - y) * 5) / (QUILL_H - 1))
  // vane width either side of the shaft, top row down
  const vane = [[0, 1], [1, 1], [1, 2], [2, 2], [2, 3], [2, 3], [2, 2], [1, 2], [1, 1], [0, 1]]
  vane.forEach(([l, r], y) => {
    const s = shaftX(y)
    for (let x = s - l; x <= s + r; x++) if (x >= 0 && x < QUILL_W) m[y][x] = 'p'
  })
  // outline every vane pixel that touches empty space
  const empty = (x, y) => x < 0 || y < 0 || x >= QUILL_W || y >= QUILL_H || m[y][x] === '.'
  const edge = []
  for (let y = 0; y < QUILL_H; y++) {
    for (let x = 0; x < QUILL_W; x++) {
      if (m[y][x] === 'p' && (empty(x - 1, y) || empty(x + 1, y) || empty(x, y - 1) || empty(x, y + 1))) edge.push([x, y])
    }
  }
  edge.forEach(([x, y]) => { m[y][x] = 'I' })
  for (let y = 1; y < vane.length - 1; y++) m[y][shaftX(y)] = 'g'      // shaft through the vane
  for (let y = vane.length; y < QUILL_H - 1; y++) m[y][shaftX(y)] = 'A' // bare barrel
  m[QUILL_H - 1][0] = 'I'                                              // nib
  return m.map((r) => r.join(''))
}
const QUILL = quillRows()

// ---------------------------------------------------------------- banner
const H = 40
const TITLE = 'SCRIPTORIUM WRITER'
const WORD_X = 56
const WORD_Y = 14
const CARET_X = WORD_X + titleW(TITLE) + 3
const W = CARET_X + 2 + 5 // caret, then parchment and border

// ---------------------------------------------------------------- page turn
// The written leaf turns over to the left. s runs from the spine (0) to the fore-edge (1)
// and v into depth, as on the page; theta rotates the leaf about the spine (0 lying right,
// PI lying left), and the fore-edge lags behind the rest of it, so the leaf curls as it goes.
function leafPt(s, v, th) {
  const t = th - 0.45 * Math.sin(th) * s * s
  const [x, y] = flat(s * Math.cos(t), v)
  return snap([x, y - lift(s) - s * Math.sin(t) * 12])
}
const TURN_ANGLES = [10, 26, 46, 68, 90, 110, 142, 160, 174] // degrees, one frame each
const TURN_HOLD = [2, 1, 1, 1, 1, 1, 1, 1, 2] // steps each frame is held

// Whole-picture frames of the leaf alone, laid over the base. The front carries the page
// just written; the back carries the left-hand page's faded text, which it lands as.
function turnFrame(deg) {
  const th = (deg * Math.PI) / 180
  const g = grid(W, H)
  for (let b = 0; b <= 120; b++) for (let a = 0; a <= 160; a++) set(g, ...leafPt(a / 160, 1 - b / 120, th), 'p')
  sweep((a) => { set(g, ...leafPt(a, 0, th), 'A'); set(g, ...leafPt(a, 1, th), 'A') }, 200)
  sweep((a) => { set(g, ...leafPt(1, a, th), 'A'); set(g, ...leafPt(0, a, th), 'A') }, 100)
  // past the vertical the leaf is nearly edge-on in this view: no text until it opens out
  if (deg >= 90 && deg < 150) return g
  const front = deg < 90
  LINE_V.forEach((v, i) => [...(front ? NEW_TEXT : OLD_TEXT)[i]].forEach((ch, k) => {
    if (ch !== '#') return
    const s = front ? 0.14 + (k + 0.5) / 14 : 0.84 - (k + 0.5) / 14
    set(g, ...leafPt(s, v, th), front ? 'I' : 'g')
  }))
  return g
}

// ---------------------------------------------------------------- timeline
// One step of the loop: where the nib is, how many pixels of each line are written, and
// which turn frame (if any) is showing.
const STEP = 0.085 // seconds
const PARK = [44, 19] // nib position while the leaf turns: clear of it and of the wordmark

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t))
// Eased glide from a to b (exclusive of a), about 1.6 px per step and never fewer than three.
function glide(a, b) {
  const n = Math.max(3, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.6))
  const out = []
  for (let k = 1; k <= n; k++) {
    const e = ease(k / n)
    out.push([Math.round(a[0] + (b[0] - a[0]) * e), Math.round(a[1] + (b[1] - a[1]) * e)])
  }
  return out
}

// Writes every line in order, lifting the nib over word gaps and gliding between lines;
// lifts off the finished page and turns it, gliding the quill home over the blank page
// beneath. The loop is seamless: it starts and ends with the quill hovering over that blank
// page and the previous one lying, turned, on the left.
function timeline() {
  const steps = []
  const written = LINES.map(() => 0)
  const push = (q, f = null) => steps.push({ q: [...q], w: [...written], f })
  const first = LINES[0][0]
  const hover = [first[0], first[1] - 2]
  let q = hover
  push(q); push(q)
  for (const p of glide(q, [first[0], first[1] - 1])) push(p)
  LINES.forEach((line, i) => {
    line.forEach(([x, y, ink], k) => {
      written[i] = k + 1
      push(q = [x, ink ? y : y - 1])
    })
    const next = LINES[i + 1]
    if (next) {
      const [bx, by] = next[0]
      const hop = [Math.round((q[0] + bx) / 2), Math.min(q[1], by) - 2]
      for (const p of glide(q, hop)) push(q = p)
      for (const p of glide(q, [bx, by - 1])) push(q = p)
    }
  })
  // lift off the finished page and drift clear of the leaf
  for (const p of glide(q, [q[0] + 1, q[1] - 2])) push(q = p)
  for (const p of glide(q, PARK)) push(q = p)
  push(q); push(q)
  // the written page leaves with the leaf; a blank one lies underneath
  written.fill(0)
  const home = glide(PARK, hover)
  let hi = 0
  TURN_ANGLES.forEach((deg, fi) => {
    for (let k = 0; k < TURN_HOLD[fi]; k++) {
      if (deg > 100 && hi < home.length) q = home[hi++] // the quill starts home as the leaf passes the spine
      push(q, fi)
    }
  })
  while (hi < home.length) push(q = home[hi++])
  return steps
}

function wordmark(g, x, y) {
  const tw = titleW(TITLE)
  write(g, x, y, TITLE, FONT, 'I', 5, 4)
  fill(g, x, y + 9, tw, 1, 'A')            // title-page rules
  fill(g, x + 10, y + 11, tw - 20, 1, 'A')
}

function baseGrid() {
  const g = grid(W, H)
  fill(g, 0, 0, W, H, 'F')                 // leather board
  outline(g, 2, 2, W - 4, H - 4, 'A')      // gilt line
  fill(g, 3, 3, W - 6, H - 6, 'P')         // parchment
  fill(g, 3, 3, W - 6, 1, 'p')             // light from the top left
  fill(g, 3, 3, 1, H - 6, 'p')
  fill(g, 3, H - 4, W - 6, 1, 'A')
  fill(g, W - 4, 3, 1, H - 6, 'A')

  drawBook(g)
  wordmark(g, WORD_X, WORD_Y)
  return g
}

// Each line is drawn whole and revealed left to right by a clip whose width steps along
// with the nib. Discrete steps keep every frame on the pixel grid.
function lineGroups(steps, pal, anim) {
  const clips = []
  const groups = LINES.map((line, i) => {
    const x0 = Math.min(...line.map(([x]) => x))
    const ys = line.map(([, y]) => y)
    const y0 = Math.min(...ys)
    const widths = steps.map((s) => (s.w[i] === 0 ? 0 : line[s.w[i] - 1][0] - x0 + 1))
    clips.push(`<clipPath id="line${i}"><rect x="${x0}" y="${y0}" width="0" height="${Math.max(...ys) - y0 + 1}">` +
      `<animate attributeName="width" values="${widths.join(';')}" ${anim}/></rect></clipPath>`)
    const g = grid(W, H)
    line.forEach(([x, y, ink]) => { if (ink) set(g, x, y, 'I') })
    return `<g clip-path="url(#line${i})">${paths(g, pal)}</g>`
  })
  return { clips, groups }
}

// Each turn frame is a whole picture, shown only on its own steps: opacity switches at
// discrete keyTimes, one per change rather than one per step.
function turnGroups(steps, pal, anim) {
  return TURN_ANGLES.map((deg, fi) => {
    const on = steps.map((s) => (s.f === fi ? 1 : 0))
    const keyTimes = []
    const values = []
    on.forEach((v, k) => {
      if (k === 0 || v !== on[k - 1]) { keyTimes.push((k / steps.length).toFixed(4)); values.push(v) }
    })
    return `<g opacity="${on[0]}">${paths(turnFrame(deg), pal)}<animate attributeName="opacity"` +
      ` values="${values.join(';')}" keyTimes="${keyTimes.join(';')}" ${anim}/></g>`
  })
}

// The quill is drawn once at the origin and translated so its nib follows the timeline.
// The group starts at the first step, so a renderer without SMIL still shows it in place.
function quillGroup(steps, pal, anim) {
  // Fail the build rather than draw the quill over the gilt line or into the wordmark.
  for (const { q: [x, y] } of steps) {
    if (y - (QUILL_H - 1) < 4 || x + QUILL_W - 1 >= WORD_X) throw new Error(`quill nib at ${x},${y} leaves the open parchment`)
  }
  const g = grid(QUILL_W, QUILL_H)
  stamp(g, 0, 0, QUILL)
  const at = steps.map(({ q: [x, y] }) => `${x} ${y - (QUILL_H - 1)}`)
  return `<g transform="translate(${at[0]})">${paths(g, pal)}` +
    `<animateTransform attributeName="transform" type="translate" values="${at.join(';')}" ${anim}/></g>`
}

function caretGroup(pal) {
  const g = grid(W, H)
  fill(g, CARET_X, WORD_Y - 1, 2, 9, 'I')
  return `<g>${paths(g, pal)}` +
    `<animate attributeName="opacity" values="1;0" keyTimes="0;0.5"` +
    ` dur="1.1s" calcMode="discrete" repeatCount="indefinite"/></g>`
}

function banner(pal, scale = 6) {
  const steps = timeline()
  const anim = `dur="${(steps.length * STEP).toFixed(2)}s" calcMode="discrete" repeatCount="indefinite"`
  const { clips, groups } = lineGroups(steps, pal, anim)
  // One top-level piece per line: keeps the animated groups countable from a shell and
  // makes a regenerated banner diff readably. No pretty-printing inside the groups.
  const body = [
    `<defs>${clips.join('')}</defs>`,
    paths(baseGrid(), pal),
    ...groups,
    ...turnGroups(steps, pal, anim),
    quillGroup(steps, pal, anim),
    caretGroup(pal)
  ].join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"` +
    ` width="${W * scale}" height="${H * scale}" shape-rendering="crispEdges"` +
    ` role="img" aria-label="Scriptorium Writer">${body}</svg>`
}

// ---------------------------------------------------------------- sprites, 16x16
const SPRITES = {
  quill: [
    '.............IgI',
    '...........IpgI.',
    '.........IppgI..',
    '.......IpppgI...',
    '.....IppppgI....',
    '....IppppgI.....',
    '...IppppgI......',
    '...IpppgI.......',
    '..IpppgI........',
    '..IppgI.........',
    '.IppgI..........',
    '.IpgI...........',
    '.IgI............',
    '.II.............',
    'I...............',
    '................',
  ],
}

// Reliability: a wax seal. Circle computed, then a lit rim up-left,
// a shadow rim down-right, and an impressed device. The device is `m`, not `F`: it is the
// same colour as the shadow rim on light, but the two part company on dark.
function sealRows(mark, r0 = 6.4, rim = 1.0) {
  const S = 16
  const cx = 7.5
  const cy = 7.5
  const px = Array.from({ length: S }, () => new Array(S).fill('.'))
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.hypot(dx, dy)
      if (d > r0) continue
      const a = Math.atan2(dy, dx)
      px[y][x] = d > r0 - rim ? (Math.cos(a + 2.36) > 0 ? 'g' : 'F') : 'e'
    }
  }
  mark.forEach((row, dy) => [...row].forEach((ch, dx) => {
    if (ch !== '.') px[5 + dy][5 + dx] = 'm'
  }))
  return px.map((r) => r.join(''))
}
const MARK_DIAMOND = ['..#..', '.###.', '#####', '.###.', '..#..']

// Developers: a pair of dividers.
const DIVIDERS = [
  '.......II.......',
  '......IggI......',
  '......IggI......',
  '......IggI......',
  '.....Ig..gI.....',
  '.....Ig..gI.....',
  '....Ig....gI....',
  '....Ig....gI....',
  '...Ig......gI...',
  '...Ig......gI...',
  '..Ig........gI..',
  '..Ig........gI..',
  '.Ig..........gI.',
  '.Ig..........gI.',
  '.I............I.',
  '................',
]

const PAGES = [
  '................',
  '.....IIIIIIII...',
  '.....IppppppI...',
  '...IIIIIIIIII...',
  '...IppppppppI...',
  '.IIIIIIIIIIII...',
  '.IppppppppppI...',
  '.IpgggggggppI...',
  '.IppppppppppI...',
  '.IpgggggggppI...',
  '.IppppppppppI...',
  '.IpgggggppppI...',
  '.IppppppppppI...',
  '.IIIIIIIIIIII...',
  '................',
  '................',
]

SPRITES.pages = PAGES
SPRITES.seal = sealRows(MARK_DIAMOND)
SPRITES.dividers = DIVIDERS

function sprite(name, pal, scale = 3) {
  const g = grid(16, 16)
  stamp(g, 0, 0, SPRITES[name])
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"` +
    ` width="${16 * scale}" height="${16 * scale}" shape-rendering="crispEdges"` +
    ` role="img" aria-label="${name}">${paths(g, pal)}</svg>`
}

// ---------------------------------------------------------------- social preview
// GitHub wants a raster at exactly 1280x640, and the banner's 4.3:1 grid cannot be
// stretched into 2:1 — so this is a second composition on a 160x80 board at 8x. Side by
// side, the book and the wordmark come to ~155 px against the board's 154 px interior, so
// here the book stands above the wordmark and each is centred on its own.
const SW = 160
const SH = 80
const SOCIAL_SCALE = 8
const SOCIAL_GAP = 5 // rows between the book's boards and the wordmark

// Bounding box of the cells that hold something.
function bounds(g) {
  const b = { x0: g.w, y0: g.h, x1: -1, y1: -1 }
  g.px.forEach((row, y) => row.forEach((c, x) => {
    if (c === null) return
    b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y)
    b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y)
  }))
  return b
}

// The banner's last written frame, as a still: page full, quill resting with its nib on the
// end of the last line. A social preview cannot animate.
function restingBook() {
  const g = grid(W, H)
  drawBook(g)
  LINES.forEach((line) => line.forEach(([x, y, ink]) => { if (ink) set(g, x, y, 'I') }))
  const book = bounds(g)
  const [nx, ny] = LINES.at(-1).findLast(([, , ink]) => ink)
  stamp(g, nx, ny - (QUILL_H - 1), QUILL)
  return { g, book, all: bounds(g) }
}

function socialGrid() {
  const g = grid(SW, SH)
  fill(g, 0, 0, SW, SH, 'F')                 // leather board
  outline(g, 2, 2, SW - 4, SH - 4, 'A')      // gilt line
  fill(g, 3, 3, SW - 6, SH - 6, 'P')         // parchment
  fill(g, 3, 3, SW - 6, 1, 'p')              // light from the top left
  fill(g, 3, 3, 1, SH - 6, 'p')
  fill(g, 3, SH - 4, SW - 6, 1, 'A')
  fill(g, SW - 4, 3, 1, SH - 6, 'A')

  // Centre the stack vertically counting the quill, which rises above the book; centre
  // the book horizontally on its own, so the quill reads as leaning out of it.
  const { g: art, book, all } = restingBook()
  const artH = all.y1 - all.y0 + 1
  const top = Math.round((SH - (artH + SOCIAL_GAP + 12)) / 2)
  const dx = Math.round((SW - (book.x1 - book.x0 + 1)) / 2) - book.x0
  const dy = top - all.y0
  art.px.forEach((row, y) => row.forEach((c, x) => { if (c !== null) set(g, x + dx, y + dy, c) }))
  wordmark(g, Math.round((SW - titleW(TITLE)) / 2), top + artH + SOCIAL_GAP)
  return g
}

// Walk the grid writing RGBA pixels at `scale`x. `null` cells become opaque frame colour:
// a social preview must not carry an alpha hole (the board fills every cell, so this is
// belt and braces).
function rasterize(g, pal, scale) {
  const w = g.w * scale
  const h = g.h * scale
  const buf = new Uint8Array(w * h * 4)
  const bytes = new Map(Object.entries(pal).map(([k, hex]) => [k, rgba(hex)]))
  const opaque = rgba(pal.F)
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const key = g.px[y][x]
      const c = key === null ? opaque : (bytes.get(key) ?? opaque)
      for (let sy = 0; sy < scale; sy++) {
        let i = ((y * scale + sy) * w + x * scale) * 4
        for (let sx = 0; sx < scale; sx++) {
          buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = c[3]
          i += 4
        }
      }
    }
  }
  return buf
}

// ---------------------------------------------------------------- output
const out = { 'banner-light.svg': banner(LIGHT), 'banner-dark.svg': banner(DARK) }
for (const name of Object.keys(SPRITES)) {
  out[`sprite-${name}.svg`] = sprite(name, LIGHT)
  out[`sprite-${name}-dark.svg`] = sprite(name, SPRITE_DARK)
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [name, svg] of Object.entries(out)) {
  writeFileSync(join(OUT_DIR, name), svg)
  console.log(`${name}  ${svg.length} bytes`)
}

const png = encodePng(rasterize(socialGrid(), LIGHT, SOCIAL_SCALE), SW * SOCIAL_SCALE, SH * SOCIAL_SCALE)
writeFileSync(join(OUT_DIR, 'social-preview.png'), png)
console.log(`social-preview.png  ${png.length} bytes (${SW * SOCIAL_SCALE}x${SH * SOCIAL_SCALE})`)
console.log(`Wrote ${Object.keys(out).length + 1} files to ${OUT_DIR}`)
