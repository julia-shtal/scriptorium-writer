import { useEffect, useState } from 'react'

/**
 * M0 placeholder. Proves the full IPC + contextBridge path by calling
 * `window.api.ping()` and rendering the result. No styling, no editor, no data
 * layer — those arrive in later milestones.
 */
function App(): JSX.Element {
  const [pong, setPong] = useState<string>('…')

  useEffect(() => {
    let cancelled = false
    window.api
      .ping()
      .then((result) => {
        if (!cancelled) setPong(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setPong(`error: ${String(err)}`)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>Scriptorium</h1>
      <p>
        IPC check — <code>window.api.ping()</code> returned:{' '}
        <strong data-testid="ping-result">{pong}</strong>
      </p>
    </div>
  )
}

export default App
