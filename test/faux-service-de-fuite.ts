import { createHash } from "node:crypto"

import { vi } from "vitest"

const URL_RANGE_PWNED = "https://api.pwnedpasswords.com/range/"

const LIGNE_NON_CORRESPONDANTE = "00000000000000000000000000000000000:1"

function empreinteSha1(motDePasse: string): string {
  return createHash("sha1").update(motDePasse).digest("hex").toUpperCase()
}

function urlDe(entree: string | URL | Request): string {
  if (typeof entree === "string") return entree
  if (entree instanceof URL) return entree.toString()
  return entree.url
}

export function fauxServiceDeFuite(
  motsDePasseCompromis: readonly string[]
): (entree: string | URL | Request) => Promise<Response> {
  const suffixesParPrefixe = new Map<string, string[]>()

  for (const motDePasse of motsDePasseCompromis) {
    const empreinte = empreinteSha1(motDePasse)
    const prefixe = empreinte.slice(0, 5)
    const suffixes = suffixesParPrefixe.get(prefixe) ?? []
    suffixes.push(`${empreinte.slice(5)}:42`)
    suffixesParPrefixe.set(prefixe, suffixes)
  }

  return vi.fn(async (entree: string | URL | Request) => {
    const url = urlDe(entree)
    if (!url.startsWith(URL_RANGE_PWNED)) {
      throw new Error(`appel réseau non simulé : ${url}`)
    }

    const prefixe = url.slice(URL_RANGE_PWNED.length).toUpperCase()
    const lignes = [
      ...(suffixesParPrefixe.get(prefixe) ?? []),
      LIGNE_NON_CORRESPONDANTE,
    ]

    return new Response(`${lignes.join("\r\n")}\r\n`, {
      status: 200,
      headers: { "content-type": "text/plain" },
    })
  })
}
