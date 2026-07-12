import type { Api, LifecycleApi } from '@shared/types'

declare global {
  interface Window {
    api: Api
    lifecycle: LifecycleApi
  }
}

export {}
