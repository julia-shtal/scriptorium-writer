/**
 * The frame colour (`--book-frame`) is declared in six places that no compiler or linker
 * connects, and all six are asserted here:
 *
 *   1. src/renderer/theme/book.css        `--book-frame`      <- the ORIGIN
 *   2. src/renderer/pwa/manifest.ts       THEME_COLOR         <- the reference below
 *   3. scripts/palette.mjs                FRAME               <- both generators read this
 *   4. android/.../values/colors.xml      scriptorium_frame
 *   5. android/.../ic_launcher_background.xml
 *   6. capacitor.config.ts                android.backgroundColor
 *
 * Every one of them paints some stage of launch — splash, launcher icon, window background
 * behind the system bars, WebView background — and a single stale copy shows up as a flash
 * of the wrong colour mid-launch, on a device, which is exactly the kind of thing nobody
 * notices for a release or two.
 *
 * (3) used to be a byte array inside gen-icon.mjs. It now lives once in scripts/palette.mjs,
 * which BOTH gen-icon.mjs and gen-readme-art.mjs import — so the chain to the launcher icon
 * is one link longer than it was, but still unbroken, and the README art now hangs off the
 * same link. scripts/palette.test.ts guards the rest of that shared palette.
 *
 * (1) is the one that matters most to guard, and it is the one a re-theme starts from:
 * book.css is where the palette lives and the obvious place to edit. If it is not linked to
 * THEME_COLOR then changing it leaves every other copy green and the native chrome stuck on
 * the old colour, which is the exact drift this file exists to prevent. The link runs
 * book.css -> THEME_COLOR, and THEME_COLOR -> everything else, so one broken edit fails
 * loudly wherever it was made.
 *
 * So the duplication is asserted rather than trusted: THEME_COLOR (src/renderer/pwa/
 * manifest.ts) is the reference, and each file is read off disk and parsed. These are
 * static-file assertions, not behaviour tests — they exist because the wiring between
 * these files is by convention only. Parsing is deliberately whitespace- and case-tolerant
 * throughout: reformatting must never turn this suite red, only a changed colour may.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { THEME_COLOR } from '../../renderer/pwa/manifest'

const ROOT = resolve(__dirname, '../../..')
const RES = resolve(ROOT, 'android/app/src/main/res')

const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8')

/** `<color name="x">#rrggbb</color>` -> `#rrggbb`, lowercased for comparison. */
function androidColor(xml: string, name: string): string | undefined {
  const m = new RegExp(`<color\\s+name="${name}"\\s*>\\s*(#[0-9a-fA-F]+)\\s*</color>`).exec(xml)
  return m?.[1].toLowerCase()
}

/**
 * The body of one `<style name="…">…</style>` block.
 *
 * Theme assertions have to be scoped to a style, never to the whole file. Android resolves
 * a theme attribute per style, so `android:windowBackground` sitting on the base `AppTheme`
 * instead of on `AppTheme.NoActionBar` is a real regression that a file-wide regex cannot
 * see: `BridgeActivity.onCreate` calls `setTheme(R.style.AppTheme_NoActionBar)`, and
 * Capacitor's SystemBars plugin reads `android.R.attr.windowBackground` off *that* theme to
 * paint the decor view. Put the item on the wrong style and the decor view falls back to the
 * AppCompat default, the white flash MC4 removed comes back, and a file-scoped test stays
 * green throughout.
 *
 * Throws rather than returning undefined so a renamed or deleted style fails loudly here
 * instead of quietly making every assertion below vacuous.
 */
function styleBlock(xml: string, name: string): string {
  const pattern = `<style\\s+name="${name.replace(/\./g, '\\.')}"[^>]*>([\\s\\S]*?)</style>`
  const m = new RegExp(pattern).exec(xml)
  if (!m) {
    throw new Error(`styles.xml has no <style name="${name}"> block`)
  }
  return m[1]
}

/**
 * `<item name="attr">value</item>` inside a style body -> `value`.
 *
 * Whitespace-tolerant on both sides of the value, because an editor or formatter wrapping
 * the value onto its own line is semantically null and must not turn the suite red. What
 * these assertions are for is the value changing, not the indentation.
 */
function themeItem(block: string, attr: string): string | undefined {
  const m = new RegExp(`<item\\s+name="${attr}"\\s*>\\s*([^<]*?)\\s*</item>`).exec(block)
  return m?.[1]
}

/**
 * `--book-frame: #rrggbb;` out of a CSS custom-property block -> `#rrggbb`, lowercased.
 *
 * Tolerant of the spacing CSS allows around the colon and before the semicolon, so a
 * formatter run cannot fail this; the semicolon is required so a value spanning into the
 * next declaration cannot be silently half-matched.
 */
function cssVar(css: string, name: string): string | undefined {
  const m = new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]+)\\s*;`).exec(css)
  return m?.[1].toLowerCase()
}

describe('Android chrome colours agree with the book-frame theme token', () => {
  it('book.css --book-frame, the origin of the whole chain, equals THEME_COLOR', () => {
    // Without this one assertion the chain has no first link: re-theming the app by editing
    // book.css (the correct-looking place) would leave the splash, the status bar and the
    // launcher icon on the old colour with the entire suite still green.
    expect(cssVar(read('src/renderer/theme/book.css'), 'book-frame')).toBe(THEME_COLOR)
  })

  it('the shared art palette paints FRAME with THEME_COLOR', () => {
    // The generators can't import the renderer's TS (they are dependency-free .mjs run by
    // node), so the colour is written out a second time in scripts/palette.mjs, which
    // gen-icon.mjs and gen-readme-art.mjs both import. Either quote character, for the same
    // Prettier reason as everywhere else in this file.
    const src = read('scripts/palette.mjs')
    const m = /export\s+const\s+FRAME\s*=\s*['"](#[0-9a-fA-F]+)['"]/.exec(src)
    expect(m).not.toBeNull()
    expect(m![1].toLowerCase()).toBe(THEME_COLOR)
    // Opaque: the adaptive/legacy backgrounds must not be see-through. The alpha used to be
    // the fourth byte of a literal here; it now lives in palette.mjs's `rgba()` helper,
    // which every rasteriser goes through, so assert that helper still ends its tuple at
    // full opacity.
    const helper = /export\s+const\s+rgba\s*=[\s\S]*?\]/.exec(src)
    expect(helper).not.toBeNull()
    expect(/0xff\s*,?\s*\]$/i.test(helper![0])).toBe(true)
  })

  it('values/colors.xml declares scriptorium_frame as THEME_COLOR', () => {
    expect(androidColor(read('android/app/src/main/res/values/colors.xml'), 'scriptorium_frame')).toBe(
      THEME_COLOR
    )
  })

  it('the adaptive icon background matches, so foreground and background agree', () => {
    const xml = read('android/app/src/main/res/values/ic_launcher_background.xml')
    expect(androidColor(xml, 'ic_launcher_background')).toBe(THEME_COLOR)
  })

  it('capacitor.config.ts gives the WebView the same background', () => {
    // Either quote character: which one this file uses is a Prettier setting, and flipping
    // it changes nothing about the colour.
    const m = /backgroundColor:\s*['"](#[0-9a-fA-F]+)['"]/.exec(read('capacitor.config.ts'))
    expect(m?.[1].toLowerCase()).toBe(THEME_COLOR)
  })
})

describe('Android launch themes', () => {
  const styles = read('android/app/src/main/res/values/styles.xml')
  // AppTheme.NoActionBar is the activity's theme after handoff; AppTheme.NoActionBarLaunch
  // is what AndroidManifest.xml declares on MainActivity. Each item below is asserted inside
  // the style that has to carry it — see styleBlock's comment for why file-wide is not good
  // enough. Note the trailing `"` in the name makes AppTheme.NoActionBar exact, so it cannot
  // accidentally match the Launch style.
  const noActionBar = styleBlock(styles, 'AppTheme.NoActionBar')
  const launch = styleBlock(styles, 'AppTheme.NoActionBarLaunch')

  it('paints the post-splash window background with the frame colour', () => {
    // SystemBars.setStyle copies android:windowBackground onto the decor view, so this
    // attribute is both the flash-guard and the colour behind the transparent system bars.
    // It is read off the ACTIVITY's theme, which is this one — hence the block scoping.
    expect(themeItem(noActionBar, 'android:windowBackground')).toBe('@color/scriptorium_frame')
  })

  it('paints the splash with the frame colour on both the 31+ and pre-31 paths', () => {
    // Theme.SplashScreen forwards this attr to android:windowSplashScreenBackground on v31+
    // and, below that, into the drawable-v23 compat layer-list that becomes
    // android:windowBackground — so this one line is what actually removes the white launch
    // flash on every supported API level.
    expect(themeItem(launch, 'windowSplashScreenBackground')).toBe('@color/scriptorium_frame')
    // The splash mark. Also live on both API eras: on 31+ the platform draws it, and on
    // 24..30 the compat layer-list draws it circle-masked over the background. Drift here
    // (e.g. to @mipmap/ic_launcher, whose baked-in frame square would show a seam inside the
    // circular mask) is the one value change that visibly alters the splash, so it is
    // asserted exactly rather than left to a device to reveal.
    expect(themeItem(launch, 'windowSplashScreenAnimatedIcon')).toBe(
      '@mipmap/ic_launcher_foreground'
    )
    // Inert today (BridgeActivity calls setTheme itself rather than installSplashScreen),
    // but asserted so it isn't dropped as noise and then missed if that ever changes.
    expect(themeItem(launch, 'postSplashScreenTheme')).toBe('@style/AppTheme.NoActionBar')
  })

  it('keeps @drawable/splash resolving, now as one XML instead of eleven PNGs', () => {
    // The style still carries Capacitor's inherited @drawable/splash reference, so the
    // resource has to exist or the build fails — and it can only exist as ONE of splash.png
    // or splash.xml per bucket, since they are the same resource name. The eleven density/
    // orientation PNGs were deleted in favour of the layer-list; assert none crept back,
    // because a stray one is a duplicate-resource build error rather than a silent bug.
    expect(themeItem(launch, 'android:background')).toBe('@drawable/splash')
    expect(existsSync(resolve(RES, 'drawable/splash.xml'))).toBe(true)
    const strays = readdirSync(RES)
      .filter((d) => d.startsWith('drawable'))
      .filter((d) => existsSync(resolve(RES, d, 'splash.png')))
    expect(strays).toEqual([])
  })
})

describe('Capacitor SystemBars', () => {
  it('forces DARK style, i.e. light icons, instead of following the system theme', () => {
    // 'DARK' describes the background: it maps to setAppearanceLightStatusBars(false).
    // Without it the style is 'DEFAULT' and a light-mode device draws dark icons on
    // dark leather.
    // Find the SystemBars block first, then the style inside it: anchoring `style` to the
    // object's first key would break on `{ overlaysWebView: false, style: 'DARK' }`, which
    // is the same config. Either quote character, for the same Prettier reason as above.
    const block = /SystemBars:\s*\{([^}]*)\}/.exec(read('capacitor.config.ts'))
    expect(block).not.toBeNull()
    const m = /\bstyle:\s*['"](\w+)['"]/.exec(block![1])
    expect(m?.[1]).toBe('DARK')
  })
})
