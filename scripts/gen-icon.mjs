// scripts/gen-icon.mjs
// Generates resources/icons/icon.ico — a placeholder book/parchment app icon for M9.
// Node built-ins only (no image deps). Regenerate with `npm run gen:icon`.
// Replace with real branding by dropping a designed icon.ico at the same path.
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
