import { randomBytes, scryptSync } from "node:crypto"

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
