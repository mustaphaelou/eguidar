import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"

export const PARAMETRES_SCRYPT = {
  N: 131072,
  r: 8,
  p: 1,
  dkLen: 64,
} as const

const PARAMETRES_HISTORIQUES = {
  N: 16384,
  r: 16,
  p: 1,
  dkLen: 64,
} as const

const MEMOIRE_DERIVATION_MAX =
  128 * PARAMETRES_SCRYPT.N * PARAMETRES_SCRYPT.r * 2
const PASSES_MAX = PARAMETRES_SCRYPT.p * 8
const LONGUEUR_HASH_MAX = 1024

const FORMAT_PHC =
  /^\$scrypt\$N=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/

const FORMAT_HISTORIQUE = /^([0-9a-fA-F]+):([0-9a-fA-F]+)$/

interface ParametresScrypt {
  N: number
  r: number
  p: number
  dkLen: number
}

function deriver(
  motDePasse: string,
  sel: Buffer | string,
  parametres: ParametresScrypt
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      motDePasse.normalize("NFKC"),
      sel,
      parametres.dkLen,
      {
        N: parametres.N,
        r: parametres.r,
        p: parametres.p,
        maxmem: 128 * parametres.N * parametres.r * 2,
      },
      (erreur, cle) => {
        if (erreur) reject(erreur)
        else resolve(cle)
      }
    )
  })
}

function egalesEnTempsConstant(calculee: Buffer, attendue: Buffer): boolean {
  if (calculee.length !== attendue.length) return false
  return timingSafeEqual(calculee, attendue)
}

function lirePhc(hash: string): {
  parametres: ParametresScrypt
  sel: Buffer
  cle: Buffer
} | null {
  const trouve = FORMAT_PHC.exec(hash)
  if (!trouve) return null

  const N = Number(trouve[1])
  const r = Number(trouve[2])
  const p = Number(trouve[3])
  if (
    !Number.isSafeInteger(N) ||
    !Number.isSafeInteger(r) ||
    !Number.isSafeInteger(p)
  ) {
    return null
  }
  if (N < 2 || r < 1 || p < 1) return null
  if (128 * N * r > MEMOIRE_DERIVATION_MAX || p > PASSES_MAX) return null

  return {
    parametres: { N, r, p, dkLen: 64 },
    sel: Buffer.from(trouve[4], "base64url"),
    cle: Buffer.from(trouve[5], "base64url"),
  }
}

function lireHistorique(hash: string): { sel: string; cle: Buffer } | null {
  const trouve = FORMAT_HISTORIQUE.exec(hash)
  if (!trouve) return null
  if (trouve[1].length % 2 !== 0 || trouve[2].length % 2 !== 0) return null
  return {
    sel: trouve[1],
    cle: Buffer.from(trouve[2], "hex"),
  }
}

interface HashAnalyse {
  parametres: ParametresScrypt
  sel: Buffer
  cle: Buffer
  historique: boolean
}

function analyserHash(hash: string): HashAnalyse | null {
  if (hash.length > LONGUEUR_HASH_MAX) return null

  const phc = lirePhc(hash)
  if (phc) {
    return {
      parametres: phc.parametres,
      sel: phc.sel,
      cle: phc.cle,
      historique: false,
    }
  }

  const historique = lireHistorique(hash)
  if (!historique) return null
  return {
    parametres: { ...PARAMETRES_HISTORIQUES },
    sel: Buffer.from(historique.sel, "utf8"),
    cle: historique.cle,
    historique: true,
  }
}

export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  const sel = randomBytes(16)
  const cle = await deriver(motDePasse, sel, PARAMETRES_SCRYPT)

  return `$scrypt$N=${PARAMETRES_SCRYPT.N},r=${PARAMETRES_SCRYPT.r},p=${PARAMETRES_SCRYPT.p}$${sel.toString("base64url")}$${cle.toString("base64url")}`
}

export async function verifierMotDePasse({
  hash,
  password,
}: {
  hash: string
  password: string
}): Promise<boolean> {
  const analyse = analyserHash(hash)
  if (!analyse) return false

  try {
    const calculee = await deriver(password, analyse.sel, analyse.parametres)
    return egalesEnTempsConstant(calculee, analyse.cle)
  } catch {
    return false
  }
}

export function motDePasseDoitEtreRehache(hash: string): boolean {
  const analyse = analyserHash(hash)
  if (!analyse) return false
  if (analyse.historique) return true

  const { N, r, p } = analyse.parametres
  return (
    N < PARAMETRES_SCRYPT.N ||
    r < PARAMETRES_SCRYPT.r ||
    p < PARAMETRES_SCRYPT.p
  )
}
