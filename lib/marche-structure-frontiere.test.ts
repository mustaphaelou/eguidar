import { describe, expect, it } from "vitest"

import {
  atteignables,
  importeDe,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

/**
 * Frontière client/serveur de la Marche de la Structure.
 *
 * `lib/marche-structure.ts` est le module neutre que ce travail ajoute, et sa
 * neutralité n'est pas une élégance : un de ses six appelants est un composant
 * client (`components/admin/delete-category-button.tsx`, #551), qui doit
 * pouvoir l'importer sans tirer `pg` (`require('dns')`) dans le bundle
 * navigateur — la panne que `next build` (Turbopack) rend, et que
 * `carte-produit-frontiere.test.ts` et `formulaire-produit-frontiere.test.ts`
 * verrouillent déjà pour leurs modules. ADR-0030 le nomme comme le troisième
 * module de ce contrat, et désigne `formulaire-produit-frontiere.test.ts`
 * comme le modèle.
 *
 * **Le graphe d'imports, jamais le nom du fichier.** `atteignables` suit les
 * imports **de valeur** — la sémantique du bundler — et s'arrête sur un module
 * `"use server"`, que le bundler remplace côté client par une référence
 * d'action. `importeDe`, lui, voit les imports de type : une garde fondée
 * dessus s'allumerait sur une arête légitime. C'est pourquoi la garde lit
 * l'ensemble atteint, et pourquoi elle rejoue une violation **synthétique**
 * plus bas : sans cette contre-épreuve, elle pourrait être verte parce qu'elle
 * ne regarde rien.
 *
 * Le piège que le spec nomme : les aides partagées portent un substitut vide de
 * `server-only` et un alias vitest qui le neutralise, parce que Next applique
 * ce marqueur au bundle et non au lanceur de tests. Deux gardes de ce secteur
 * s'en accommodent ; celle-ci ne s'en remet pas à l'alias — elle lit le graphe.
 */

const MODULE_NEUTRE = "lib/marche-structure.ts"
const BASE = "lib/db.ts"
const AIDE_FRONTIERE = "lib/use-cases/outils-frontiere.ts"

/**
 * Ce que le module doit porter, énoncé symbole par symbole : un fichier vidé,
 * ou réduit à une signature, passerait sinon pour neutre. Les trois surfaces
 * sont celles que les six appelants traversent, et `LiensStructure` est le fait
 * qu'ils construisent.
 */
const SYMBOLES = [
  "marcheStructure",
  "LiensStructure",
  "MarcheStructure",
  "ancetres",
  "descendance",
  "horsArbre",
] as const

/**
 * Les paquets que le module ne doit atteindre ni par lui-même ni par un
 * voisin : la base (`pg`, donc `require('dns')`), les modules serveur
 * (`next/headers`, `next/navigation`), le marqueur `server-only`, un runtime
 * client (`react`), et tout `node:`, insoluble dans un bundle navigateur.
 */
const MODULES_INTERDITS = [
  "lib/db",
  "next/headers",
  "next/navigation",
  "next/cache",
  "next/server",
  "server-only",
  "react",
  "react-dom",
  "node:crypto",
  "node:fs",
  "node:path",
] as const

/**
 * Les fichiers du dépôt que le module ne doit pas atteindre, vérifiés sur
 * l'ensemble atteint : `atteignables` ignore les spécifieurs de paquet, faute
 * de source dans le dépôt, mais il résout `@/` et les chemins relatifs — donc
 * ces voisins-là sont bien visibles.
 */
const CHEMINS_INTERDITS = [
  BASE,
  "lib/use-cases/storefront.ts",
  "lib/use-cases/admin-structure.ts",
  "lib/generated/prisma/client.ts",
] as const

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../app",
  "../components",
  "./"
)
const PAR_CHEMIN = new Map(SOURCES.map((source) => [source.chemin, source]))
const ATTEINTS = atteignables(MODULE_NEUTRE, PAR_CHEMIN)

function sourceDe(chemin: string): SourceProduction {
  const trouvee = PAR_CHEMIN.get(chemin)
  if (!trouvee) throw new Error(`Source de production absente : ${chemin}`)
  return trouvee
}

function aucuneDependance(source: string, chemin: string): void {
  for (const nom of MODULES_INTERDITS) {
    expect(importeDe(source, nom), `${chemin} → ${nom}`).toBe(false)
  }
}

/**
 * Un pont pour les contre-épreuves : une carte de sources réduite à ce qu'un
 * cas de figure demande. `atteignables` ne lit que la source qu'on lui donne ;
 * la carte n'a pas besoin d'être le dépôt.
 */
function carteDe(...paires: [string, string][]): Map<string, SourceProduction> {
  return new Map(paires.map(([chemin, source]) => [chemin, { chemin, source }]))
}

describe("Marche de la Structure — frontière client/serveur", () => {
  it("le module est neutre : ni directive, ni crochet, ni module serveur", () => {
    const { source } = sourceDe(MODULE_NEUTRE)

    for (const symbole of SYMBOLES) {
      expect(source, symbole).toContain(symbole)
    }

    expect(source).not.toMatch(/^["']use client["']/m)
    expect(source).not.toMatch(/^["']use server["']/m)
    expect(source).not.toMatch(/\buse[A-Z]\w*\(/)
    // L'invariant est l'interdiction, pas l'appel : **aucun** `node:` ne se
    // résout dans un bundle navigateur, et la liste ci-dessus l'applique. Une
    // expression épinglée ici confondrait la règle avec son exemple du jour.
    expect(source).not.toMatch(/from\s*["']node:/)
    aucuneDependance(source, MODULE_NEUTRE)
  })

  it("le graphe de valeur n'atteint ni la base ni un module serveur", () => {
    // Parcours non vacuant, d'abord : la graine est bien dans la carte, et le
    // parcours descend — il atteint plus que sa seule graine.
    expect(PAR_CHEMIN.has(MODULE_NEUTRE)).toBe(true)
    expect(PAR_CHEMIN.has("lib/carte-produit.ts")).toBe(true)
    expect(ATTEINTS.size).toBeGreaterThan(0)
    expect(ATTEINTS.has(MODULE_NEUTRE)).toBe(true)

    for (const chemin of CHEMINS_INTERDITS) {
      expect(ATTEINTS.has(chemin), chemin).toBe(false)
    }
    for (const chemin of ATTEINTS) {
      const { source } = sourceDe(chemin)
      expect(source, chemin).not.toMatch(/^["']use client["']/m)
      expect(source, chemin).not.toMatch(/^["']use server["']/m)
      aucuneDependance(source, chemin)
    }
  })

  it("le composant client traverse la Marche, et n'atteint ni la base ni une lecture serveur", () => {
    // La couture n'a de sens que si le client la traverse vraiment (#551) :
    // sans cette épreuve, le module pourrait rester neutre et n'être importé
    // par aucune surface cliente — et `descendDe` pourrait revenir à la main.
    const CLIENT = "components/admin/delete-category-button.tsx"
    expect(PAR_CHEMIN.has(CLIENT)).toBe(true)

    const atteints = atteignables(CLIENT, PAR_CHEMIN)
    expect(atteints.has(MODULE_NEUTRE)).toBe(true)

    // Le graphe de **valeur** du composant — ce que le bundler mettrait dans
    // le paquet navigateur — ne touche ni la base, ni la lecture serveur du
    // storefront, ni le client Prisma : un import imprudent y réintroduirait
    // `pg` (`require('dns')`) et ferait tomber `next build` (Turbopack).
    for (const interdit of [
      BASE,
      "lib/use-cases/storefront.ts",
      "lib/use-cases/admin-structure.ts",
      "lib/generated/prisma/client.ts",
    ]) {
      expect(atteints.has(interdit), interdit).toBe(false)
    }

    // Et aucun module atteint ne rouvre la porte par un voisin : ni le
    // marqueur serveur, ni un module de requête ou de cache.
    for (const chemin of atteints) {
      const { source } = sourceDe(chemin)
      expect(source, chemin).not.toMatch(/^["']use server["']/m)
      for (const nom of [
        "lib/db",
        "server-only",
        "next/headers",
        "next/cache",
      ]) {
        expect(importeDe(source, nom), `${chemin} → ${nom}`).toBe(false)
      }
    }
  })

  it("le parcours est non vacuant : les arbres sont visités, et la base se laisse trouver", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(SOURCES.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        "app/(boutique)/page.tsx",
        "app/admin/categories/page.tsx",
        "components/admin/delete-category-button.tsx",
        MODULE_NEUTRE,
      ])
    )
    // Témoin positif : le même parcours, depuis une page qui doit atteindre la
    // base, la trouve. Sans ce témoin, `ATTEINTS.has(BASE)` pourrait être faux
    // pour la seule raison que le parcours ne suit aucune arête.
    expect(
      atteignables("app/admin/categories/page.tsx", PAR_CHEMIN).has(BASE)
    ).toBe(true)
  })

  it("la garde tombe sur une violation synthétique, écrite dans le module réel", () => {
    // La contre-épreuve qui donne son sens aux trois épreuves ci-dessus : une
    // arête de valeur vers la base, glissée dans le module réel, doit faire
    // tomber le garde. Sans elle, une garde verte pourrait l'être parce qu'elle
    // ne suit rien.
    const reel = sourceDe(MODULE_NEUTRE).source
    const premiereLigne = reel.split("\n")[0]!
    const enViolation = `${premiereLigne}\nimport { prisma } from "@/lib/db"\n${reel.slice(premiereLigne.length)}`

    expect(enViolation).not.toBe(reel)
    expect(importeDe(enViolation, BASE)).toBe(true)
    expect(
      atteignables(
        MODULE_NEUTRE,
        new Map(PAR_CHEMIN).set(MODULE_NEUTRE, {
          chemin: MODULE_NEUTRE,
          source: enViolation,
        })
      ).has(BASE)
    ).toBe(true)

    // Et la même arête, écrite en **type**, ne la fait pas tomber : c'est la
    // distinction qui justifie `atteignables` plutôt qu'`importeDe`.
    const enType = `${premiereLigne}\nimport type { PrismaClient } from "@/lib/db"\n${reel.slice(premiereLigne.length)}`
    expect(
      atteignables(
        MODULE_NEUTRE,
        new Map(PAR_CHEMIN).set(MODULE_NEUTRE, {
          chemin: MODULE_NEUTRE,
          source: enType,
        })
      ).has(BASE)
    ).toBe(false)
  })

  it("la garde suit un voisin, pas seulement la graine", () => {
    // Le second cas que le contrat couvre : la violation n'est pas dans le
    // module mais dans un module qu'il emprunte. La carte est réduite au cas,
    // pour que la preuve ne dépende pas de l'arbre réel.
    const voisin = carteDe(
      [MODULE_NEUTRE, 'import { aider } from "@/lib/voisin"\n'],
      ["lib/voisin.ts", 'import { prisma } from "@/lib/db"\n'],
      [BASE, ""]
    )
    expect(atteignables(MODULE_NEUTRE, voisin).has(BASE)).toBe(true)

    const voisinNeutre = carteDe(
      [MODULE_NEUTRE, 'import { aider } from "@/lib/voisin"\n'],
      ["lib/voisin.ts", "export const aider = 1\n"],
      [BASE, ""]
    )
    expect(atteignables(MODULE_NEUTRE, voisinNeutre).has(BASE)).toBe(false)
  })

  it("les aides de frontière ne sont pas dans le graphe du module", () => {
    // Une garde qui s'appuierait sur les aides partagées ne doit pas se
    // compter elle-même : le module ne les emprunte pas, et son graphe de
    // valeur reste celui qu'il annonce.
    expect(ATTEINTS.has(AIDE_FRONTIERE)).toBe(false)
    expect([...ATTEINTS]).toEqual([MODULE_NEUTRE])
  })
})
