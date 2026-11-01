import { randomBytes, scryptSync } from "node:crypto"

// Jeux de paramètres scrypt candidats, dans l'ordre croissant du coût. Les
// valeurs reprennent le tableau OWASP (r=8 fixé par OWASP) plus le défaut
// historique de la bibliothèque (r=16), pour comparer sur la même machine.
const JEUX = [
  { nom: "defaut bibliothèque", N: 2 ** 14, r: 16, p: 1 },
  { nom: "OWASP le plus faible", N: 2 ** 14, r: 8, p: 5 },
  { nom: "OWASP intermédiaire bas", N: 2 ** 15, r: 8, p: 3 },
  { nom: "OWASP intermédiaire haut", N: 2 ** 16, r: 8, p: 2 },
  { nom: "OWASP le plus fort (choisi)", N: 2 ** 17, r: 8, p: 1 },
] as const

const ITERATIONS = 3
const MOT_DE_PASSE = "MotDePasse!Benchmark1234"
const SEL = randomBytes(16)
const CLE_OCTETS = 64

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

function mesurer(jeu: (typeof JEUX)[number]): Resultat {
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
  const resultats = JEUX.map((jeu) => mesurer(jeu))

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
    "choisis sont N=131072, r=8, p=1 (palier OWASP le plus fort), sauf si"
  )
  console.log(
    "l'hôte Coolify mesure au-dessus d'une seconde : descendre alors au palier"
  )
  console.log("immédiatement inférieur, N=65536, r=8, p=2.")
}

principal()
