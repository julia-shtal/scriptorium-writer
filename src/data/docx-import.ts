/**
 * docx → HTML for M14 import (moved to src/data in MP6 so the web build reuses it).
 * `mammoth` converts the uploaded `.docx` bytes to clean HTML; the renderer's
 * `htmlToDoc` then parses that HTML against the editor schema (the security boundary —
 * see htmlToDoc.ts). The style map preserves Word's "Heading 1" as `<h1>` so it can act
 * as a chapter-split boundary; mammoth's warnings (dropped tables/images/etc.) become
 * the caller's lossy notice.
 *
 * Takes an `ArrayBuffer` (not a Node `Buffer`) so each platform supplies the bytes:
 * Electron reads the file with `node:fs`; web reads it from a File input. mammoth's
 * Node build takes `{ buffer }`, its browser build takes `{ arrayBuffer }`; we pass both
 * keys, and both resolve via `JSZip.loadAsync`. `convert` is injected so this unit-tests
 * without a real `.docx` fixture.
 */
import mammoth from 'mammoth'

/** Keep Word's Heading 1 as an <h1>; everything else uses mammoth defaults. */
export const HEADING_STYLE_MAP = ["p[style-name='Heading 1'] => h1:fresh"]

type MammothMessage = { type: string; message: string }
type MammothResult = { value: string; messages: MammothMessage[] }
type MammothConvert = (
  input: { buffer?: Uint8Array; arrayBuffer?: ArrayBuffer },
  options: { styleMap: string[] }
) => Promise<MammothResult>

export interface DocxHtml {
  html: string
  warnings: string[]
}

/** Convert docx bytes to `{ html, warnings }`. `convert` is injectable for tests. */
export async function convertDocxToHtml(
  bytes: ArrayBuffer,
  convert: MammothConvert = mammoth.convertToHtml as unknown as MammothConvert
): Promise<DocxHtml> {
  // mammoth's Node build reads only { path | buffer | file }; its browser build reads
  // only { arrayBuffer }. Both funnel into JSZip.loadAsync, which accepts a Uint8Array
  // OR an ArrayBuffer. Supply BOTH keys so one call works on Electron (Node, uses
  // `buffer`) and web (uses `arrayBuffer`) — no platform branch, and no Node `Buffer`
  // type leaking into this shared module.
  const input = { buffer: new Uint8Array(bytes), arrayBuffer: bytes }
  const result = await convert(input, { styleMap: HEADING_STYLE_MAP })
  const warnings = result.messages.filter((m) => m.type === 'warning').map((m) => m.message)
  return { html: result.value, warnings }
}
