import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '@shared/types'

/**
 * Typed `window.api` surface. Every method is a thin wrapper over
 * `ipcRenderer.invoke`, with signatures that exactly match `@shared/types` (Api).
 *
 * M0 exposes only `ping`. M1 grows this to the full FileService surface.
 */
const api: Api = {
  ping: () => ipcRenderer.invoke('ping')
}

// With contextIsolation enabled (it always is — see main), expose through the
// contextBridge. The `else` branch only exists as a defensive fallback and should
// never run given our BrowserWindow config.
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-expect-error — define on window only in the (unreachable) non-isolated case
  window.api = api
}
