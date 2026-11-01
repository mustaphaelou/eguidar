import { randomBytes, scryptSync } from "node:crypto"

/**
 * L'empreinte du format historique de Better Auth (`sel:hex`), pour éprouver
 * les chemins qui doivent continuer à accepter un Compte client existant.
 */
export function hacheMotDePasseHistorique(motDePasse: string): string {
  const sel = randomBytes(16).toString("hex")
  const cle = scryptSync(motDePasse.normalize("NFKC"), sel, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  })
  return `${sel}:${cle.toString("hex")}`
}

/** Attend un refus de l'API Better Auth et rend son code et son statut. */
export async function refus(promesse: Promise<unknown>): Promise<{
  code?: string
  statusCode?: number
}> {
  try {
    await promesse
  } catch (error) {
    const { body, statusCode } = error as {
      body?: { code?: string }
      statusCode?: number
    }
    return { code: body?.code, statusCode }
  }
  throw new Error("attendu : un refus de la bibliothèque")
}
