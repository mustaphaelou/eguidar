import { readFile } from "node:fs/promises"
import path from "node:path"

import tailwind from "@tailwindcss/postcss"
import postcss, {
  type AtRule,
  type Declaration,
  type Node,
  type Root,
  type Rule,
} from "postcss"

export type FeuilleDeStyleCompilee = {
  css: string
  racine: Root
}

const SELECTEURS_DE_BASE = ["*", "*::before", "*::after"]

let compilation: Promise<FeuilleDeStyleCompilee> | undefined

export function compilerLaFeuilleDeStyle(): Promise<FeuilleDeStyleCompilee> {
  compilation ??= compiler()

  return compilation
}

function estRegleArobase(noeud: Node): noeud is AtRule {
  return noeud.type === "atrule"
}

function estRegle(noeud: Node): noeud is Rule {
  return noeud.type === "rule"
}

export function couchesDe(noeud: Node): string[] {
  const couches: string[] = []
  let parent = noeud.parent

  while (parent) {
    if (estRegleArobase(parent) && parent.name === "layer") {
      couches.push(parent.params)
    }
    parent = parent.parent
  }

  return couches
}

export function mediaDe(noeud: Node): string[] {
  const medias: string[] = []
  let parent = noeud.parent

  while (parent) {
    if (estRegleArobase(parent) && parent.name === "media") {
      medias.push(parent.params)
    }
    parent = parent.parent
  }

  return medias
}

export function requeteMedia(noeud: Node): AtRule | undefined {
  let parent = noeud.parent

  while (parent) {
    if (estRegleArobase(parent) && parent.name === "media") return parent
    parent = parent.parent
  }

  return undefined
}

export function estDansRequete(noeud: Node, requete: string): boolean {
  return mediaDe(noeud).includes(requete)
}

export function estHorsRequete(noeud: Node): boolean {
  return mediaDe(noeud).length === 0
}

export function estDansLaCoucheBase(noeud: Node): boolean {
  return couchesDe(noeud).includes("base")
}

export function estHorsCouche(noeud: Node): boolean {
  return couchesDe(noeud).length === 0
}

export function estDansLaRacine(noeud: Node): boolean {
  let parent = noeud.parent

  while (parent) {
    if (estRegle(parent) && parent.selector === ":root") return true
    parent = parent.parent
  }

  return false
}

export function reglesDuSelecteur(
  feuille: FeuilleDeStyleCompilee,
  selecteur: string
): Rule[] {
  const regles: Rule[] = []

  feuille.racine.walkRules((regle) => {
    if (regle.selectors.includes(selecteur)) regles.push(regle)
  })

  return regles
}

export function selecteursDe(feuille: FeuilleDeStyleCompilee): string[] {
  const selecteurs: string[] = []

  feuille.racine.walkRules((regle) => {
    selecteurs.push(regle.selector)
  })

  return selecteurs
}

export function valeurDe(regle: Rule, propriete: string): string | undefined {
  let valeur: string | undefined

  regle.walkDecls(propriete, (declaration) => {
    valeur = declaration.value
  })

  return valeur
}

export function valeursDe(
  noeudOuNoeuds: Rule | Rule[],
  propriete: string
): string[] {
  const noeuds = Array.isArray(noeudOuNoeuds) ? noeudOuNoeuds : [noeudOuNoeuds]
  const valeurs: string[] = []

  for (const noeud of noeuds) {
    noeud.walkDecls(propriete, (declaration) => {
      valeurs.push(valeurNormalisee(declaration.value))
    })
  }

  return valeurs
}

export function declarationsDe(
  feuille: FeuilleDeStyleCompilee,
  propriete: string
): Declaration[] {
  const declarations: Declaration[] = []

  feuille.racine.walkDecls(propriete, (declaration) => {
    declarations.push(declaration)
  })

  return declarations
}

export function valeurNormalisee(valeur: string): string {
  return valeur
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim()
}

export function regleDeBase(feuille: FeuilleDeStyleCompilee): Rule {
  let trouvee: Rule | undefined

  feuille.racine.walkRules((regle) => {
    const selecteurs = regle.selectors.map((selecteur) => selecteur.trim())

    if (
      selecteurs.length === SELECTEURS_DE_BASE.length &&
      SELECTEURS_DE_BASE.every((selecteur) => selecteurs.includes(selecteur)) &&
      estDansLaCoucheBase(regle)
    ) {
      trouvee = regle
    }
  })

  if (!trouvee) throw new Error("la règle de base est absente du CSS émis")

  return trouvee
}

async function compiler(): Promise<FeuilleDeStyleCompilee> {
  const chemin = path.resolve(process.cwd(), "app/globals.css")
  const source = await readFile(chemin, "utf8")
  const resultat = await postcss([tailwind()]).process(source, { from: chemin })

  return { css: resultat.css, racine: resultat.root }
}
