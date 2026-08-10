/**
 * Web Content-Security-Policy (MP7). Single source: imported by the prod CSP inject
 * plugin in `vite.web.config.ts` and by the node test. Modelled on the Electron policy
 * (`injectProdCsp` in electron.vite.config.ts) with two web additions:
 *   - `worker-src 'self'` for the MP4 OPFS module worker and the service worker.
 *   - `manifest-src 'self'` for the web app manifest.
 * `style-src` keeps `'unsafe-inline'` because TipTap injects inline styles. The app makes
 * no network requests after load, so no remote origins are allowed anywhere.
 */
export const WEB_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'"
].join('; ')
