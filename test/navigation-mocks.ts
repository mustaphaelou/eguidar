import { vi } from "vitest"

import type { Client } from "@/lib/use-cases/session-courante"

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

/**
 * Le stub de `lireSession` : la Session courante répond un Client complet, ou
 * `null`. Typé sur la vraie signature du module — un Client partiel ne
 * compile pas — et importé en type seulement, sans quoi ce fichier tirerait
 * le module serveur dans les suites qui le chargent.
 */
export const sessionCouranteMock = vi.fn<() => Promise<Client | null>>()
