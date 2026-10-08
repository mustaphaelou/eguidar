import { describe, expect, it } from "vitest"

import {
  atteignables,
  directive,
  importeDe,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

/**
 * Frontière client/serveur de la Marche de la Structure.
 *
 * `lib/marche-structure.ts` est le module neutre que ce travail ajoute, et sa
 * neutralité n'est pas une élégance : le cœur doit rester importable des deux
 * côtés, parce qu'une projection pure de la Structure peut être demandée par
 * une surface cliente, et que le module qui les possèderait tous — la Lecture,
 * `lib/use-cases/lecture-structure.ts` — lit la base et ne peut donc pas être
 * atteint par un `"use client"` (ADR-0028, ADR-0030). Le contrat est le même que
 * `lib/carte-produit.ts` (ADR-0022) et `lib/formulaire-produit.ts` (ADR-0026) ;
 * ADR-0030 désigne `formulaire-produit-frontiere.test.ts` comme le modèle, et la
 * dernière épreuve ci-dessous en reprend le geste.
 *
 * **Ce qui est arrivé à l'appelant client, et ce que la garde en dit maintenant.**
 * La boîte de suppression traversait le cœur depuis #551, et c'était la raison
 * pour laquelle sa neutralité était *actuelle* : un module `"use client"`
 * l'atteignait pour de bon. #573 la lui retire — la boîte reçoit ses deux listes
 * de cibles et la table des noms, que la page lui passe (US 40), et
 * `descendDe` disparaît avec elle. L'amendement d'ADR-0030 consigne ce
 * changement et désigne cette épreuve comme celle qui doit tomber ; elle est
 * donc **retournée, pas affaiblie** — et l'amendement le dit aussi : là où elle
 * affirmait qu'un client atteignait le cœur, elle affirme qu'aucun ne l'atteint,
 * sur l'ensemble des modules clients déduits de leur directive. Un garde écrit sur une liste de
 * noms s'allumerait sur un client neuf qui n'a rien à reprocher, et resterait
 * muet sur celui qui importerait — c'est le piège nommé d'ADR-0028, et il vaut
 * pour les gardes comme pour les actions.
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
 * ou réduit à une signature, passerait sinon pour neutre. Les surfaces sont
 * celles que les appelants traversent, et `StructureLue` est la projection
 * qu'ils ont en main.
 *
 * **Trois de ces entrées sont l'ordre, et c'est ce qu'un cœur vidé
 * n'emporterait pas avec lui.** `liensDesStructures` est la porte par laquelle
 * le module de lecture entre — c'est par elle qu'il garde les liens pour
 * toutes ses questions d'un coup —, `comparerParNom` est l'export qui porte la
 * promesse d'ordre que le module rend sans la réécrire : **cinq** de ses
 * projections classent par lui, et la sixième — le fil d'Ariane — rend un
 * chemin, pas un classement. `StructureOrdonnee` en est la forme : **les deux** faits que
 * l'ordre compare, l'identifiant et le nom. Un cœur vidé de son comparateur
 * resterait neutre, donc passerait cette garde, et le dépôt perdrait sa
 * promesse d'ordre sans qu'aucune ligne de journal ne le dise — le même
 * défaut qu'une garde qui n'énonce pas ce qu'elle garde (ADR-0030, US 31).
 */
const SYMBOLES = [
  "marcheStructure",
  "marcheDesStructures",
  "liensDesStructures",
  "LiensStructure",
  "StructureLue",
  "MarcheStructure",
  "ancetres",
  "descendance",
  "horsArbre",
  "racines",
  "enfantsDe",
  "StructureOrdonnee",
  "comparerParNom",
  "descendanceDe",
  "complementDe",
  "complementDepuis",
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

  it("aucun module client n'atteint la Marche, et le composant de suppression ne l'importe plus", () => {
    // **L'inverse de ce que la garde affirmait avant #573, et sa forme
    // présente.** La troisième épreuve disait « le composant client traverse la
    // Marche » : elle prouvait que la neutralité était *actuelle*, qu'un
    // `"use client"` l'atteignait pour de bon. Cette raison est retirée avec
    // l'appelant — `components/admin/delete-category-button.tsx` reçoit désormais
    // ses deux listes de cibles et la table des noms, que la page lui passe, et
    // n'importe plus le cœur (US 40). L'amendement d'ADR-0030 le consigne.
    //
    // Ce qui reste n'est pas la même affirmation, et c'est pourquoi elle est
    // écrite : **aucun module `"use client"` n'atteint le cœur, dans tout le dépôt.**
    // Le graphe de valeur de la boîte de suppression — ce que le bundler
    // mettrait dans le paquet navigateur — ne touche donc plus la Marche, ni la
    // base, ni une lecture serveur, ni le client Prisma : un import imprudent y
    // réintroduirait `pg` (`require('dns')`) et ferait tomber `next build`
    // (Turbopack). Et aucun module atteint ne rouvre la porte par un voisin : ni le
    // marqueur serveur, ni un module de requête ou de cache.
    const CLIENT = "components/admin/delete-category-button.tsx"
    expect(PAR_CHEMIN.has(CLIENT)).toBe(true)
    expect(directive(sourceDe(CLIENT).source)).toBe("use client")

    const atteints = atteignables(CLIENT, PAR_CHEMIN)
    expect(atteints.has(MODULE_NEUTRE)).toBe(false)

    for (const interdit of [
      BASE,
      "lib/use-cases/storefront.ts",
      "lib/use-cases/admin-structure.ts",
      "lib/use-cases/lecture-structure.ts",
      "lib/generated/prisma/client.ts",
    ]) {
      expect(atteints.has(interdit), interdit).toBe(false)
    }

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

    // **Et dans tout le dépôt, pas seulement dans cette boîte.** Un `"use client"`
    // qui atteindrait un jour le cœur romprait le contrat sans qu'aucune des
    // épreuves ci-dessus ne le voie : chacune ne regarde qu'un chemin. La
    // neutralité est un fait du module, elle se vérifie donc sur l'ensemble des
    // clients, déduit de la directive et non d'une liste de noms — un garde écrit
    // sur une liste s'allumerait sur un client neuf qui n'aurait rien à reprocher,
    // et resterait muet sur celui qui importerait (ADR-0028).
    const clients = SOURCES.filter(
      ({ source }) => directive(source) === "use client"
    )
    expect(clients.length).toBeGreaterThan(0)
    expect(clients.map(({ chemin }) => chemin)).toContain(CLIENT)
    for (const { chemin } of clients) {
      expect(
        atteignables(chemin, PAR_CHEMIN).has(MODULE_NEUTRE),
        `${chemin} → ${MODULE_NEUTRE}`
      ).toBe(false)
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
