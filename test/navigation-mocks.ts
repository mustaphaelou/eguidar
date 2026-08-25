import { vi } from "vitest"

export class RedirectSentinel extends Error {
  url: string

  constructor(url: string) {
    super(`NEXT_REDIRECT;replace;${url};307;`)
    this.name = "NEXT_REDIRECT"
    this.url = url
  }
}

export const redirectMock = vi.fn((url: string) => {
  throw new RedirectSentinel(url)
})

export const sessionUserMock = vi.fn()

export const adminSessionMock = vi.fn()
