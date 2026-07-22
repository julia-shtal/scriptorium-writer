/**
 * docx → HTML for M14 import. Runs in main (Node): mammoth converts the uploaded `.docx`
 * bytes to clean HTML, which crosses IPC to the renderer where TipTap parses it into the
 * canon (keeps the only doc-model parser in the renderer). The style map preserves Word's
 * built-in "Heading 1" as `<h1>` so it can act as a chapter-split boundary; mammoth's
 * warning messages (dropped tables/images/etc.) become the caller's lossy notice.
 *
 * The converter is injected so this module unit-tests without a real `.docx` fixture.
 */
import mammoth from 'mammoth'

/** Keep Word's Heading 1 as an <h1>; everything else uses mammoth defaults. */
export const HEADING_STYLE_MAP = ["p[style-name='Heading 1'] => h1:fresh"]

type MammothMessage = { type: string; message: string }
type MammothResult = { value: string; messages: MammothMessage[] }
type MammothConvert = (
  input: { buffer: Buffer },
  options: { styleMap: string[] }
) => Promise<MammothResult>

export interface DocxHtml {
  html: string
  warnings: string[]
}

/** Convert docx bytes to `{ html, warnings }`. `convert` is injectable for tests. */
export async function convertDocxToHtml(
  buffer: Buffer,
  convert: MammothConvert = mammoth.convertToHtml as unknown as MammothConvert
): Promise<DocxHtml> {
  const result = await convert({ buffer }, { styleMap: HEADING_STYLE_MAP })
  const warnings = result.messages.filter((m) => m.type === 'warning').map((m) => m.message)
  return { html: result.value, warnings }
}
