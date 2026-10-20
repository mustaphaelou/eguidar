import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const RACINE = import.meta.dirname

const FICHIER_EXEMPLE = path.join(RACINE, ".env.example")
const FICHIER_EXCLUSIONS = path.join(RACINE, ".dockerignore")
const FICHIER_NOTES = path.join(RACINE, "README.md")

const VARIABLES_DE_PRODUCTION = [
  "POSTGRES_PASSWORD",
  "DATABASE_URL",
  "TEST_DATABASE_URL",
  "MEILI_MASTER_KEY",
  "BETTER_AUTH_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "FACEBOOK_CLIENT_SECRET",
  "TURNSTILE_SECRET_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "ADMIN_PASSWORD",
]

const NOM_SENSIBLE = /(?:PASSWORD|SECRET|ACCESS_KEY|MASTER_KEY|API_KEY)/

const NOTIONS_D_AVERTISSEMENT = {
  "la valeur d'exemple": /exemple|example/i,
  "une consigne pour la vôtre": /propre|génér|generat|remplac|renseign|obten/i,
  "l'interdiction de réutilisation": /jamais|never/i,
  "la production": /production/i,
}

type Bloc = { nom: string; commentaires: string[] }

function blocsDeLEspaceExemple(): Bloc[] {
  const lignes = readFileSync(FICHIER_EXEMPLE, "utf8").split("\n")
  const blocs: Bloc[] = []
  let commentaires: string[] = []

  for (const ligne of lignes) {
    const contenu = ligne.trim()

    if (contenu === "") {
      commentaires = []
      continue
    }

    if (contenu.startsWith("#")) {
      commentaires.push(contenu)
      continue
    }

    const affectation = /^([A-Z][A-Z0-9_]*)=/.exec(contenu)
    if (affectation === null) {
      continue
    }

    blocs.push({ nom: affectation[1], commentaires })
    commentaires = []
  }

  return blocs
}

function motifsDExclusion(): string[] {
  return readFileSync(FICHIER_EXCLUSIONS, "utf8")
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "" && !ligne.startsWith("#"))
}

function sectionDesNotes(titre: string): string {
  const notes = readFileSync(FICHIER_NOTES, "utf8")
  const debut = notes.indexOf(`## ${titre}`)

  if (debut === -1) {
    throw new Error(`README.md n'a pas de section « ${titre} ».`)
  }

  const fin = notes.indexOf("\n## ", debut + 2)
  return notes.slice(debut, fin === -1 ? undefined : fin)
}

describe("l'espace d'environnement d'exemple ne peut pas semer un secret connu", () => {
  it("avertit devant chaque variable de production", () => {
    const blocs = new Map(
      blocsDeLEspaceExemple().map((bloc) => [bloc.nom, bloc])
    )
    const manquants: string[] = []

    for (const nom of VARIABLES_DE_PRODUCTION) {
      const bloc = blocs.get(nom)

      if (bloc === undefined) {
        manquants.push(`« ${nom} » n'est plus dans .env.example.`)
        continue
      }

      const texte = bloc.commentaires.join("\n")
      const absentes = Object.entries(NOTIONS_D_AVERTISSEMENT)
        .filter(([, notion]) => !notion.test(texte))
        .map(([libelle]) => libelle)

      if (absentes.length > 0) {
        manquants.push(
          `« ${nom} » n'est pas précédé d'un avertissement qui porte ${absentes.join(", ")}.`
        )
      }
    }

    expect(manquants).toEqual([])
  })

  it("garde la liste alignée sur toutes les variables sensibles du fichier", () => {
    const noms = blocsDeLEspaceExemple().map((bloc) => bloc.nom)
    const sensibles = noms.filter((nom) => NOM_SENSIBLE.test(nom))

    expect(
      sensibles.filter((nom) => !VARIABLES_DE_PRODUCTION.includes(nom))
    ).toEqual([])
    expect(
      VARIABLES_DE_PRODUCTION.filter((nom) => !noms.includes(nom))
    ).toEqual([])
  })
})

describe("le contexte de construction Docker ne transporte aucun environnement", () => {
  it("exclut .env et .env.*, puis ré-inclut seulement l'exemple", () => {
    const motifs = motifsDExclusion()
    const ignoreEnv = motifs.indexOf(".env")
    const ignoreVariantes = motifs.indexOf(".env.*")
    const reinclutExemple = motifs.indexOf("!.env.example")

    expect(ignoreEnv, "« .env » manque des exclusions.").toBeGreaterThanOrEqual(
      0
    )
    expect(
      ignoreVariantes,
      "« .env.* » manque des exclusions."
    ).toBeGreaterThanOrEqual(0)
    expect(
      reinclutExemple,
      "« !.env.example » manque : l'exemple ne serait plus dans le contexte."
    ).toBeGreaterThanOrEqual(0)
    expect(reinclutExemple).toBeGreaterThan(ignoreEnv)
    expect(reinclutExemple).toBeGreaterThan(ignoreVariantes)
  })

  it("ne ré-inclut aucun autre fichier d'environnement", () => {
    const exceptions = motifsDExclusion().filter(
      (motif) => motif.startsWith("!") && motif !== "!.env.example"
    )

    expect(exceptions.filter((motif) => /(^|\/)\.env/.test(motif))).toEqual([])
  })
})

describe("les notes d'exploitation préviennent de la copie des environnements", () => {
  it("nomme le standalone et exige un environnement de construction sans secret", () => {
    const section = sectionDesNotes("Vérifier l’image de déploiement")

    expect(section).toMatch(/standalone/i)
    expect(section).toMatch(/\.env/)
    expect(section).toMatch(/copie|recopie/i)
    expect(section).toMatch(/sans secret/i)
  })
})
