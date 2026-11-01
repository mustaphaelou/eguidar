import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"

/**
 * Les paramètres scrypt choisis pour 2026. N=2^17, r=8, p=1 est le palier le
 * plus fort du tableau OWASP, mesuré à ~480 ms sur la machine de développement ;
 * la confirmation sur l'hôte Coolify est suivie par #837, et changer la
 * constante suffit à déclencher un rehachage opportuniste des Comptes clients.
 */
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

/**
 * Un hash stocké ne doit pas pouvoir imposer une dérivation démesurée : la
 * mémoire est plafonnée au double du palier courant (deux fois 128 Mio), et le
 * nombre de passes à huit fois le palier courant.
 */
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
  // Mémoire et passes plafonnées, pas les paramètres pris isolément : N=2^20
  // avec r=32 demanderait 4 Gio si chaque borne était vérifiée séparément.
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
  // La bibliothèque passait la chaîne hexadécimale elle-même comme sel : ses
  // octets UTF-8, pas les 16 octets décodés. On reproduit ce format tel quel.
  return {
    sel: trouve[1],
    cle: Buffer.from(trouve[2], "hex"),
  }
}

/** Écrit un PHC scrypt auto-descriptif : `$scrypt$N=…,r=…,p=…$sel$clé`. */
export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  const sel = randomBytes(16)
  const cle = await deriver(motDePasse, sel, PARAMETRES_SCRYPT)

  return `$scrypt$N=${PARAMETRES_SCRYPT.N},r=${PARAMETRES_SCRYPT.r},p=${PARAMETRES_SCRYPT.p}$${sel.toString("base64url")}$${cle.toString("base64url")}`
}

/**
 * Vérifie un PHC scrypt en relisant ses paramètres, ou l'ancien format
 * `salt:hex` produit par Better Auth. Ne lève jamais : un hash illisible est un
 * refus, pas une erreur serveur.
 */
export async function verifierMotDePasse({
  hash,
  password,
}: {
  hash: string
  password: string
}): Promise<boolean> {
  if (hash.length > LONGUEUR_HASH_MAX) return false

  try {
    const phc = lirePhc(hash)
    if (phc) {
      const calculee = await deriver(password, phc.sel, phc.parametres)
      return egalesEnTempsConstant(calculee, phc.cle)
    }

    const historique = lireHistorique(hash)
    if (!historique) return false
    const calculee = await deriver(password, historique.sel, {
      ...PARAMETRES_HISTORIQUES,
    })
    return egalesEnTempsConstant(calculee, historique.cle)
  } catch {
    return false
  }
}

/**
 * Le rehachage s'applique à l'ancien format et aux PHC dont les paramètres sont
 * sous la cible. Un hash déjà à la cible ou au-dessus ne bouge pas.
 */
export function motDePasseDoitEtreRehache(hash: string): boolean {
  if (hash.length > LONGUEUR_HASH_MAX) return false
  if (lireHistorique(hash)) return true

  const phc = lirePhc(hash)
  if (!phc) return false
  const { N, r, p } = phc.parametres
  return (
    N < PARAMETRES_SCRYPT.N ||
    r < PARAMETRES_SCRYPT.r ||
    p < PARAMETRES_SCRYPT.p
  )
}
