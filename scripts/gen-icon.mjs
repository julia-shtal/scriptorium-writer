// scripts/gen-icon.mjs
// Single generator for every platform's app artwork, from one vector-ish description of
// the book/parchment mark. One command (`npm run gen:icon`) rewrites all three targets so
// they can never drift apart:
//   1. resources/icons/icon.ico          — Electron desktop (7 sizes in one container)
//   2. src/renderer/public/icons/*.png   — PWA (192/512 "any" + a 512 maskable)
//   3. android/app/src/main/res/mipmap-* — Android adaptive + legacy launcher icons (MC4)
// Node built-ins only (no image deps) — a hand-rolled PNG encoder and ICO container, which
// is why the art is drawn from rectangles rather than loaded from a designed source file.
// Replace with real branding by dropping designed assets at the same paths (and then this
// script becomes a no-op you should delete rather than keep running over them).
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'resources', 'icons', 'icon.ico')
const SIZES = [16, 24, 32, 48, 64, 128, 256]

// Book-theme-ish palette (literals; the script does not import renderer CSS).
const PARCHMENT = [0xef, 0xe2, 0xc4, 0xff] // warm page
const INK = [0x4a, 0x33, 0x22, 0xff]       // deep brown cover/spine
const PAGE = [0xfb, 0xf4, 0xe4, 0xff]      // cream pages
const ACCENT = [0x8a, 0x5a, 0x2b, 0xff]    // accent line
const FRAME = [0x3a, 0x2a, 0x1d, 0xff]     // --book-frame: dark leather (PWA bg/theme)

// --- tiny raster helpers (operate on a size*size RGBA Uint8Array) ---
function makeCanvas(n) {
  return new Uint8Array(n * n * 4)
}
function blend(buf, n, x, y, c) {
  if (x < 0 || y < 0 || x >= n || y >= n) return
  const i = (y * n + x) * 4
  const a = c[3] / 255
  if (a <= 0) return
  buf[i] = Math.round(c[0] * a + buf[i] * (1 - a))
  buf[i + 1] = Math.round(c[1] * a + buf[i + 1] * (1 - a))
  buf[i + 2] = Math.round(c[2] * a + buf[i + 2] * (1 - a))
  buf[i + 3] = Math.round(c[3] + buf[i + 3] * (1 - a))
}
function fillRoundRect(buf, n, x0, y0, x1, y1, r, c) {
  for (let y = Math.floor(y0); y < y1; y++) {
    for (let x = Math.floor(x0); x < x1; x++) {
      let cx = null, cy = null
      if (x < x0 + r && y < y0 + r) { cx = x0 + r; cy = y0 + r }
      else if (x > x1 - r && y < y0 + r) { cx = x1 - r; cy = y0 + r }
      else if (x < x0 + r && y > y1 - r) { cx = x0 + r; cy = y1 - r }
      else if (x > x1 - r && y > y1 - r) { cx = x1 - r; cy = y1 - r }
      if (cx !== null) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy
        if (dx * dx + dy * dy > r * r) continue
      }
      blend(buf, n, x, y, c)
    }
  }
}
function fillRect(buf, n, x0, y0, x1, y1, c) {
  for (let y = Math.floor(y0); y < y1; y++)
    for (let x = Math.floor(x0); x < x1; x++) blend(buf, n, x, y, c)
}

function drawIcon(n) {
  const buf = makeCanvas(n) // transparent
  const s = (v) => Math.round(v * n) // normalized 0..1 -> px
  fillRoundRect(buf, n, s(0.06), s(0.06), s(0.94), s(0.94), s(0.16), PARCHMENT)
  fillRoundRect(buf, n, s(0.22), s(0.24), s(0.78), s(0.76), s(0.05), INK)
  fillRect(buf, n, s(0.28), s(0.30), s(0.485), s(0.70), PAGE)
  fillRect(buf, n, s(0.515), s(0.30), s(0.72), s(0.70), PAGE)
  fillRect(buf, n, s(0.492), s(0.28), s(0.508), s(0.72), ACCENT)
  const line = [...ACCENT.slice(0, 3), 0x66]
  for (const yy of [0.40, 0.50, 0.60]) {
    fillRect(buf, n, s(0.31), s(yy), s(0.46), s(yy) + Math.max(1, s(0.015)), line)
    fillRect(buf, n, s(0.54), s(yy), s(0.69), s(yy) + Math.max(1, s(0.015)), line)
  }
  return buf
}

/**
 * Composite an `inner`x`inner` RGBA buffer into the centre of an `n`x`n` one. Every
 * target below is "the same book art, scaled down into a safe zone" — only the safe-zone
 * fraction and the background differ — so the scale-and-centre step lives here once.
 */
function compositeCentred(buf, n, art, inner) {
  const off = Math.round((n - inner) / 2)
  for (let y = 0; y < inner; y++) {
    for (let x = 0; x < inner; x++) {
      const i = (y * inner + x) * 4
      blend(buf, n, x + off, y + off, [art[i], art[i + 1], art[i + 2], art[i + 3]])
    }
  }
}

/**
 * Maskable variant: solid frame background edge-to-edge with the book art inset into
 * the centre 80% safe zone. Android crops maskable icons to a circle/squircle, so the
 * art must not reach the edges and the background must be opaque.
 */
function drawMaskableIcon(n) {
  const buf = makeCanvas(n)
  fillRect(buf, n, 0, 0, n, n, FRAME) // opaque background, no transparency
  const inner = Math.round(n * 0.8)
  compositeCentred(buf, n, drawIcon(inner), inner)
  return buf
}

/**
 * Android adaptive-icon FOREGROUND layer (`@mipmap/ic_launcher_foreground`). The canvas is
 * 108dp but the launcher may crop anything outside the centre 72dp — and it also parallaxes
 * the layer, which moves the visible window around — so the art gets a 66% safe zone, not
 * the 80% a PWA maskable icon can afford. Background stays transparent: the launcher
 * composes `@color/ic_launcher_background` (the frame colour) underneath.
 */
function drawAdaptiveForeground(n) {
  const buf = makeCanvas(n)
  const inner = Math.round(n * 0.66)
  compositeCentred(buf, n, drawIcon(inner), inner)
  return buf
}

/** Zero the alpha outside the inscribed circle, in place. */
function applyCircleMask(buf, n) {
  const c = n / 2
  const r2 = c * c
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x + 0.5 - c
      const dy = y + 0.5 - c
      if (dx * dx + dy * dy > r2) buf[(y * n + x) * 4 + 3] = 0
    }
  }
}

/**
 * Android LEGACY launcher icon (`@mipmap/ic_launcher` / `ic_launcher_round`), used below
 * API 26 where adaptive icons don't exist. 48dp canvas, no system-applied mask, so the
 * shape has to be baked in: an opaque frame square with the art inset for breathing room,
 * plus a circle-masked variant for the launchers that request `roundIcon`.
 */
function drawLegacyIcon(n, { round }) {
  const buf = makeCanvas(n)
  fillRect(buf, n, 0, 0, n, n, FRAME)
  // 0.86 rather than the maskable 0.8: nothing crops these, so the art can sit larger —
  // but it still needs a margin, or the round mask would clip the parchment's corners.
  const inner = Math.round(n * 0.86)
  compositeCentred(buf, n, drawIcon(inner), inner)
  if (round) applyCircleMask(buf, n)
  return buf
}

// --- PNG encoder (color type 6, 8-bit) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0)
  return Buffer.concat([len, typeBytes, data, crc])
}
function encodePng(buf, n) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(n, 0)
  ihdr.writeUInt32BE(n, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const raw = Buffer.alloc(n * (n * 4 + 1))
  for (let y = 0; y < n; y++) {
    raw[y * (n * 4 + 1)] = 0
    buf.subarray(y * n * 4, (y + 1) * n * 4).forEach((v, i) => {
      raw[y * (n * 4 + 1) + 1 + i] = v
    })
  }
  const idat = deflateSync(raw)
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// --- ICO container (PNG-in-ICO) ---
function buildIco(pngs) {
  const count = pngs.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)
  const entries = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  pngs.forEach((p, i) => {
    const e = 16 * i
    entries[e] = p.size >= 256 ? 0 : p.size
    entries[e + 1] = p.size >= 256 ? 0 : p.size
    entries[e + 2] = 0
    entries[e + 3] = 0
    entries.writeUInt16LE(1, e + 4)
    entries.writeUInt16LE(32, e + 6)
    entries.writeUInt32LE(p.data.length, e + 8)
    entries.writeUInt32LE(offset, e + 12)
    offset += p.data.length
  })
  return Buffer.concat([header, entries, ...pngs.map((p) => p.data)])
}

const pngs = SIZES.map((size) => ({ size, data: encodePng(drawIcon(size), size) }))
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, buildIco(pngs))
console.log(`Wrote ${OUT} (${SIZES.length} sizes: ${SIZES.join(', ')})`)

// PWA icons (MP7): same vector art as the .ico, one source of truth. 192/512 are
// full-bleed "any"; the maskable 512 has a solid frame background + inset art.
const PWA_DIR = join(HERE, '..', 'src', 'renderer', 'public', 'icons')
mkdirSync(PWA_DIR, { recursive: true })
const pwaTargets = [
  { file: 'icon-192.png', bytes: encodePng(drawIcon(192), 192) },
  { file: 'icon-512.png', bytes: encodePng(drawIcon(512), 512) },
  { file: 'icon-maskable-512.png', bytes: encodePng(drawMaskableIcon(512), 512) }
]
for (const { file, bytes } of pwaTargets) writeFileSync(join(PWA_DIR, file), bytes)
console.log(`Wrote ${pwaTargets.length} PWA icons to ${PWA_DIR}`)

// Android launcher icons (MC4): same art again, overwriting Capacitor's template artwork
// in place. The mipmap directories are checked in (they are the app's real resources, not
// build output), so this is an edit of tracked files — re-run it after changing the art.
// Densities are the standard mdpi..xxxhdpi ladder; the px size is dp * scale, and the two
// families have different canvases (108dp adaptive foreground, 48dp legacy icon).
const ANDROID_RES = join(HERE, '..', 'android', 'app', 'src', 'main', 'res')
const DENSITIES = [
  { dir: 'mipmap-mdpi', scale: 1 },
  { dir: 'mipmap-hdpi', scale: 1.5 },
  { dir: 'mipmap-xhdpi', scale: 2 },
  { dir: 'mipmap-xxhdpi', scale: 3 },
  { dir: 'mipmap-xxxhdpi', scale: 4 }
]
let androidCount = 0
for (const { dir, scale } of DENSITIES) {
  const target = join(ANDROID_RES, dir)
  mkdirSync(target, { recursive: true })
  const fg = Math.round(108 * scale)
  const legacy = Math.round(48 * scale)
  const files = [
    ['ic_launcher_foreground.png', encodePng(drawAdaptiveForeground(fg), fg)],
    ['ic_launcher.png', encodePng(drawLegacyIcon(legacy, { round: false }), legacy)],
    ['ic_launcher_round.png', encodePng(drawLegacyIcon(legacy, { round: true }), legacy)]
  ]
  for (const [file, bytes] of files) writeFileSync(join(target, file), bytes)
  androidCount += files.length
}
console.log(
  `Wrote ${androidCount} Android launcher icons to ${ANDROID_RES} ` +
    `(${DENSITIES.length} densities x foreground/legacy/round)`
)
