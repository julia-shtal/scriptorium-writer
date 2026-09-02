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
import { PARCHMENT, PAGE, ACCENT, FRAME, GOLD, EMBER, ICON_INK, rgba } from './palette.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = process.argv[2] ?? join(HERE, '..', 'assets', 'readme')

// ---------------------------------------------------------------- palette
// F frame  P parchment  p page(light)  I ink  A accent  g gold  e ember
const LIGHT = {
  F: FRAME, P: PARCHMENT, p: PAGE, I: ICON_INK,
  A: ACCENT, g: GOLD, e: EMBER,
}
// Candlelit variant for GitHub dark mode: same object, dimmer room. These stay literal and
// local — they are art direction for the README only, and nothing else in the app uses them.
const DARK = {
  F: '#241a12', P: '#d8c7a3', p: '#e8dcc0', I: '#3a2a1d',
  A: '#7a4d24', g: '#967742', e: '#8a3427',
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
function paths(g, pal) {
  const byColor = new Map()
  for (const r of toRects(g)) {
    const d = `M${r.x} ${r.y}h${r.w}v${r.h}h-${r.w}z`
    byColor.set(r.c, (byColor.get(r.c) ?? '') + d)
  }
  return [...byColor].map(([c, d]) => `<path fill="${pal[c]}" d="${d}"/>`).join('')
}

// ---------------------------------------------------------------- candle
// 15 wide. The flame is animated, so it lives outside the body grid.
const FLAME = [
  ['.......e.......', '......epe......', '......gpg......', '.....egpge.....',
    '.....egpge.....', '.....egpge.....', '.....egege.....'],
  ['........e......', '.......epe.....', '......gpg......', '.....egpge.....',
    '.....egpge.....', '.....egpge.....', '.....egege.....'],
  ['.......e.......', '.......p.......', '......epe......', '......gpg......',
    '.....egpge.....', '.....egpge.....', '.....egege.....'],
  ['......e........', '.....epe.......', '......gpg......', '.....egpge.....',
    '.....egpge.....', '.....egpge.....', '.....egege.....'],
]
const FLAME_H = 7

// Beeswax taper: accent on the lit edge, frame on the shadow edge, so the
// silhouette separates from parchment without a hard black outline.
const CANDLE_BODY = [
  '.......I.......', // wick
  '.......I.......',
  '...ApppIpppF...', // melted pool, wick embedded
  '..ApppppppppF..',
  '..AppggggAAAF..',
  '..AppggggAAAF..',
  '..AppggggAAApF.', // drip, right
  '..AppggggAAApF.',
  '..AppggggAAApF.',
  '..AppggggAAAgF.',
  '..AppggggAAAF..',
  '.ApppggggAAAF..', // drip, left
  '.ApppggggAAAF..',
  '.ApppggggAAAF..',
  '..AppggggAAAF..',
  '..AppggggAAAF..',
  '..AppggggAAAF..',
  '..AppggggAAAF..',
  '.AppppggggAAAF.', // wax pooling out
  'AppppppggggAAAF',
  '.AAAAAAAAAAAAA.', // cast shadow
]

// ---------------------------------------------------------------- banner
const W = 152
const H = 40
const TITLE = 'SCRIPTORIUM WRITER'
const CANDLE_X = 10
const CANDLE_Y = 6
const WORD_X = 32
const WORD_Y = 14
const CARET_X = WORD_X + titleW(TITLE) + 3

function baseGrid() {
  const g = grid(W, H)
  fill(g, 0, 0, W, H, 'F')                 // leather board
  outline(g, 2, 2, W - 4, H - 4, 'A')      // gilt line
  fill(g, 3, 3, W - 6, H - 6, 'P')         // parchment
  fill(g, 3, 3, W - 6, 1, 'p')             // light from the top left
  fill(g, 3, 3, 1, H - 6, 'p')
  fill(g, 3, H - 4, W - 6, 1, 'A')
  fill(g, W - 4, 3, 1, H - 6, 'A')

  stamp(g, CANDLE_X, CANDLE_Y + FLAME_H, CANDLE_BODY)

  const tw = titleW(TITLE)
  write(g, WORD_X, WORD_Y, TITLE, FONT, 'I', 5, 4)
  fill(g, WORD_X, WORD_Y + 9, tw, 1, 'A')            // title-page rules
  fill(g, WORD_X + 10, WORD_Y + 11, tw - 20, 1, 'A')
  return g
}

function flameGroup(i, pal) {
  const g = grid(W, H)
  stamp(g, CANDLE_X, CANDLE_Y, FLAME[i])
  const values = FLAME.map((_, k) => (k === i ? 1 : 0)).join(';')
  return `<g opacity="${i === 0 ? 1 : 0}">${paths(g, pal)}` +
    `<animate attributeName="opacity" values="${values}" keyTimes="0;0.22;0.44;0.72"` +
    ` dur="1.05s" calcMode="discrete" repeatCount="indefinite"/></g>`
}

function caretGroup(pal) {
  const g = grid(W, H)
  fill(g, CARET_X, WORD_Y - 1, 2, 9, 'I')
  return `<g>${paths(g, pal)}` +
    `<animate attributeName="opacity" values="1;0" keyTimes="0;0.5"` +
    ` dur="1.1s" calcMode="discrete" repeatCount="indefinite"/></g>`
}

function banner(pal, scale = 6) {
  // One top-level piece per line: keeps the animated groups countable from a shell and
  // makes a regenerated banner diff readably. No pretty-printing inside the groups.
  const body = [
    paths(baseGrid(), pal),
    ...FLAME.map((_, i) => flameGroup(i, pal)),
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
// a shadow rim down-right, and an impressed device.
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
    if (ch !== '.') px[5 + dy][5 + dx] = 'F'
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
// GitHub wants a raster at exactly 1280x640, and the banner's 3.8:1 grid cannot be
// stretched into 2:1 — so this is a second composition on a 160x80 board at 8x, with the
// candle and the wordmark kept at the banner's relative offsets and centred as one group.
const SW = 160
const SH = 80
const SOCIAL_SCALE = 8

function socialGrid() {
  const g = grid(SW, SH)
  fill(g, 0, 0, SW, SH, 'F')                 // leather board
  outline(g, 2, 2, SW - 4, SH - 4, 'A')      // gilt line
  fill(g, 3, 3, SW - 6, SH - 6, 'P')         // parchment
  fill(g, 3, 3, SW - 6, 1, 'p')              // light from the top left
  fill(g, 3, 3, 1, SH - 6, 'p')
  fill(g, 3, SH - 4, SW - 6, 1, 'A')
  fill(g, SW - 4, 3, 1, SH - 6, 'A')

  const tw = titleW(TITLE)
  const dx = WORD_X - CANDLE_X // candle-to-wordmark offsets, straight from the banner
  const dy = WORD_Y - CANDLE_Y
  const groupW = dx + tw
  const groupH = Math.max(FLAME_H + CANDLE_BODY.length, dy + 12)
  const gx = Math.round((SW - groupW) / 2)
  const gy = Math.round((SH - groupH) / 2)

  stamp(g, gx, gy, FLAME[0]) // frame 0 only: a social preview cannot animate
  stamp(g, gx, gy + FLAME_H, CANDLE_BODY)
  write(g, gx + dx, gy + dy, TITLE, FONT, 'I', 5, 4)
  fill(g, gx + dx, gy + dy + 9, tw, 1, 'A')            // title-page rules
  fill(g, gx + dx + 10, gy + dy + 11, tw - 20, 1, 'A')
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
  // Ink and frame are the sprite outline; at DARK's values they vanish against GitHub's
  // #0d1117, so both are lifted to DARK.p — the palette's lightest tone.
  out[`sprite-${name}-dark.svg`] = sprite(name, { ...DARK, I: DARK.p, F: DARK.p })
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
