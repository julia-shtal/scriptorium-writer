import { describe, it, expect } from 'vitest'
import { WEB_CSP } from './csp'

describe('web CSP', () => {
  it('locks default/script to self and allows the directives the app needs', () => {
    expect(WEB_CSP).toContain("default-src 'self'")
    expect(WEB_CSP).toContain("script-src 'self'")
    expect(WEB_CSP).toContain("style-src 'self' 'unsafe-inline'")
    expect(WEB_CSP).toContain("img-src 'self' data:")
    expect(WEB_CSP).toContain("font-src 'self'")
    expect(WEB_CSP).toContain("worker-src 'self'")
    expect(WEB_CSP).toContain("manifest-src 'self'")
  })

  it('has no unsafe script sources', () => {
    expect(WEB_CSP).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(WEB_CSP).not.toContain('unsafe-eval')
  })
})
