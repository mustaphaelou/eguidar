import { randomBytes, scryptSync } from "node:crypto"

import { PARAMETRES_SCRYPT } from "../lib/mot-de-passe-hache"

// Les paliers OWASP (r=8 fixé par OWASP), dans l'ordre croissant du coût, et le
// défaut historique de la bibliothèque (r=16), pour comparer sur la même
// machine. Le palier choisi est lu dans `PARAMETRES_SCRYPT` : changer la
// constante met à jour la mesure, la ligne marquée et le texte de clôture.
interface JeuScrypt {
  nom: string
  N: number
  r: number
  p: number
}

const DEFAUT_HISTORIQUE: JeuScrypt = {
  nom: "defaut bibliothèque",
  N: 2 ** 14,
  r: 16,
  p: 1,
}

const PALIERS_OWASP: readonly JeuScrypt[] = [
  { nom: "OWASP le plus faible", N: 2 ** 14, r: 8, p: 5 },
  { nom: "OWASP intermédiaire bas", N: 2 ** 15, r: 8, p: 3 },
  { nom: "OWASP intermédiaire haut", N: 2 ** 16, r: 8, p: 2 },
  { nom: "OWASP le plus fort", N: 2 ** 17, r: 8, p: 1 },
]

function memesParametres(
  a: Pick<JeuScrypt, "N" | "r" | "p">,
  b: Pick<JeuScrypt, "N" | "r" | "p">
): boolean {
  return a.N === b.N && a.r === b.r && a.p === b.p
}

const INDEX_PALIER_CHOISI = PALIERS_OWASP.findIndex((palier) =>
  memesParametres(palier, PARAMETRES_SCRYPT)
)

const EST_DEFAUT_HISTORIQUE = memesParametres(
  DEFAUT_HISTORIQUE,
  PARAMETRES_SCRYPT
)

const PALIER_CHOISI: JeuScrypt =
  INDEX_PALIER_CHOISI >= 0
    ? PALIERS_OWASP[INDEX_PALIER_CHOISI]
    : EST_DEFAUT_HISTORIQUE
      ? DEFAUT_HISTORIQUE
      : {
          nom: "palier personnalisé",
          N: PARAMETRES_SCRYPT.N,
          r: PARAMETRES_SCRYPT.r,
          p: PARAMETRES_SCRYPT.p,
        }

// Le repli est le palier OWASP immédiatement inférieur au palier choisi ; le
// défaut historique et un palier personnalisé n'ont pas de voisin OWASP.
const PALIER_REPLI: JeuScrypt | null =
  INDEX_PALIER_CHOISI > 0 ? PALIERS_OWASP[INDEX_PALIER_CHOISI - 1] : null

const JEUX: readonly JeuScrypt[] = [
  DEFAUT_HISTORIQUE,
  ...PALIERS_OWASP,
  ...(INDEX_PALIER_CHOISI === -1 && !EST_DEFAUT_HISTORIQUE
    ? [PALIER_CHOISI]
    : []),
]

const JEUX_AFFICHES = JEUX.map((jeu) =>
  memesParametres(jeu, PALIER_CHOISI)
    ? { ...jeu, nom: `${jeu.nom} (choisi)` }
    : jeu
)

const ITERATIONS = 3
const MOT_DE_PASSE = "MotDePasse!Benchmark1234"
const SEL = randomBytes(16)
const CLE_OCTETS = PARAMETRES_SCRYPT.dkLen

interface Resultat {
  nom: string
  N: number
  r: number
  p: number
  memoireMio: number
  minMs: number
  moyenneMs: number
  maxMs: number
}

function mesurer(jeu: JeuScrypt): Resultat {
  const { N, r, p, nom } = jeu
  const memoireMio = (128 * N * r) / (1024 * 1024)
  const maxmem = Math.max(64 * 1024 * 1024, 128 * N * r * 2)
  const durees: number[] = []

  for (let i = 0; i < ITERATIONS; i++) {
    const debut = process.hrtime.bigint()
    scryptSync(MOT_DE_PASSE.normalize("NFKC"), SEL, CLE_OCTETS, {
      N,
      r,
      p,
      maxmem,
    })
    const fin = process.hrtime.bigint()
    durees.push(Number(fin - debut) / 1_000_000)
  }

  const minMs = Math.min(...durees)
  const maxMs = Math.max(...durees)
  const moyenneMs = durees.reduce((a, b) => a + b, 0) / durees.length

  return {
    nom,
    N,
    r,
    p,
    memoireMio,
    minMs,
    moyenneMs,
    maxMs,
  }
}

function principal(): void {
  const json = process.argv.includes("--json")
  const resultats = JEUX_AFFICHES.map((jeu) => mesurer(jeu))

  if (json) {
    console.log(JSON.stringify(resultats, null, 2))
    return
  }

  console.log("Mesure du coût scrypt (mot de passe de référence, sel fixe)")
  console.log(
    `Machine : ${process.platform} ${process.arch}, Node ${process.version}`
  )
  console.log(`Itérations par jeu : ${ITERATIONS}`)
  console.log("")
  console.log(
    "nom".padEnd(32) +
      "N".padStart(8) +
      "r".padStart(4) +
      "p".padStart(4) +
      "Mio".padStart(8) +
      "min ms".padStart(10) +
      "moy ms".padStart(10) +
      "max ms".padStart(10)
  )
  console.log("-".repeat(86))
  for (const resultat of resultats) {
    console.log(
      resultat.nom.padEnd(32) +
        resultat.N.toString().padStart(8) +
        resultat.r.toString().padStart(4) +
        resultat.p.toString().padStart(4) +
        resultat.memoireMio.toFixed(0).padStart(8) +
        resultat.minMs.toFixed(1).padStart(10) +
        resultat.moyenneMs.toFixed(1).padStart(10) +
        resultat.maxMs.toFixed(1).padStart(10)
    )
  }
  console.log("")
  console.log(
    "Cible : une empreinte sous une seconde (règle OWASP). Les paramètres"
  )
  console.log(
    `choisis sont N=${PALIER_CHOISI.N}, r=${PALIER_CHOISI.r}, p=${PALIER_CHOISI.p}` +
      (INDEX_PALIER_CHOISI >= 0
        ? ` (palier ${PALIERS_OWASP[INDEX_PALIER_CHOISI].nom}), sauf si`
        : ", sauf si")
  )
  if (PALIER_REPLI) {
    console.log(
      "l'hôte Coolify mesure au-dessus d'une seconde : descendre alors au palier"
    )
    console.log(
      `immédiatement inférieur, N=${PALIER_REPLI.N}, r=${PALIER_REPLI.r}, p=${PALIER_REPLI.p}.`
    )
  } else {
    console.log(
      "l'hôte Coolify mesure au-dessus d'une seconde : aucun palier OWASP ne lui"
    )
    console.log("est inférieur.")
  }
}

principal()
