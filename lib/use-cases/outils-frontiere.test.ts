import { describe, expect, it } from "vitest"

import {
  atteignables,
  directive,
  empruntsDeValeur,
  importeDe,
  lire,
  sourcesDeProduction,
  sourcesToutes,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

/**
 * Les aides de frontière, et le contrat dont le dépôt entier dépend.
 *
 * **Ces aides n'avaient pas de suite à elles.** Cinq des douze gardes du dépôt les
 * empruntent, `atteignables` y passe par `voisins`, et cinq fichiers de garde les
 * atteignent donc par transit : un contrat partagé, exercé nulle part directement, ne
 * tient que par les gardes qui l'appellent — et une garde qui casse voit sa
 * contre-épreuve échouer, ce qui ne dit pas **quelle** des cinq l'a cassée, ni si le
 * comportement changé est un oubli ou une décision. C'est aussi ce que le spec
 * demande des gardes qu'il écrit : « shaped so that consolidation stays possible
 * later » (#564, § hors périmètre) — une consolidation suppose qu'on sache ce que
 * chaque garde repose.
 *
 * **Ce qui a changé, et pourquoi c'est ici qu'on le voit.** `directive` lisait la
 * **première** entrée du prologue ; il lit aujourd'hui la première réclamation
 * **reconnue** de tout le prologue. Une source qui ouvre par `"use strict";` puis
 * réclame `"use client"` passait pour neutre, et une garde de frontière qui déduisit
 * ses modules clients d'une telle lecture était verte par une absence de classement
 * et non par une absence d'arête. C'est le défaut que toute contre-épreuve doit
 * traquer, et il n'apparaît que si l'instrument se prouve **lui-même** — d'où les
 * deux directions ci-dessous, dans le sens où la garde les lit, pas dans celui d'un
 * exemple.
 *
 * Il vit dans `test/` — donc sa suite est ici, à côté du module — et non dans une
 * des gardes : une aide partagée prouvée par une de ses clientes serait prouvée par
 * hasard. `test/moteur-recherche-recette.ts` et `test/structure-fixtures.ts` sont
 * les autres aides du dépôt, et leur suite est leur propre fichier.
 */

const AIDE = "lib/use-cases/outils-frontiere.ts"

/** Une carte de sources réduite à ce qu'un cas de figure demande. */
function carteDe(...paires: [string, string][]): Map<string, SourceProduction> {
  return new Map(paires.map(([chemin, source]) => [chemin, { chemin, source }]))
}

describe("outils de frontière — la directive qu'une source réclame", () => {
  it("lit la réclamation du prologue entier, et non sa première entrée", () => {
    expect(directive('"use client"')).toBe("use client")
    expect(directive('"use server"')).toBe("use server")
    expect(directive('"use strict";\n"use client"')).toBe("use client")
    expect(directive('"use strict";\n"use server"\n')).toBe("use server")
    expect(directive('// @ts-check\n"use client"\n')).toBe("use client")
    expect(directive('"use client"\n"use server"\n')).toBe("use client")
    // La réclamation la plus simple reste la plus forte : `"use client"` ouvre le
    // fichier dans tous les fichiers `"use client"` du dépôt, et une garde qui
    // n'en voyait pas la moitié rangerait la moitié du dépôt du mauvais côté.
    expect(directive('"use strict";\n\n\n"use client"\n\n')).toBe("use client")
  })

  it("ne prend pas pour une réclamation une chaîne qui se trouve dans le fichier", () => {
    // Ce qui n'est pas une réclamation reste une chaîne ordinaire : c'est le
    // prologue qui décide, pas la présence du littéral. Une garde qui lirait client
    // une source pareille rangerait à tort du côté des réécritures RSC un module
    // qui ne les réclame pas.
    expect(directive('export const cote = "use client"\n')).toBeNull()
    expect(directive('const x = 1\n"use client"\n')).toBeNull()
    expect(directive("/* use client */\nexport const x = 1\n")).toBeNull()
    // La réclamation reste lue même si le fichier est plus long : elle est dans le
    // prologue, donc elle vaut.
    expect(directive('"use client"\n// un commentaire\n"use server"\n')).toBe(
      "use client"
    )
    expect(directive("")).toBeNull()
    expect(directive("export const x = 1\n")).toBeNull()
  })
})

describe("outils de frontière — la limite assumée du prologue", () => {
  it("reconnaît une réclamation précédée d'un commentaire, mais pas d'un commentaire intercalé", () => {
    // **La limite que le module assume, et qu'une contre-épreuve doit nommer.**
    // Un commentaire *avant* le prologue appartient au préambule : il n'en fait pas
    // partie, donc la réclamation qui suit est lue normalement. Un commentaire
    // *entre* deux entrées, en revanche, arrête le prologue — donc la seconde
    // réclamation n'est pas lue. Cacher une réclamation derrière un commentaire
    // serait agir en mauvaise foi ; on ne s'y prête pas, et la suite le dit plutôt
    // que de le laisser croire.
    expect(directive('// un commentaire\n"use client"\n')).toBe("use client")
    expect(directive('/* un commentaire */\n"use client"\n')).toBe("use client")
    expect(
      directive('"use strict";\n// un commentaire\n"use client"\n')
    ).toBeNull()
  })
})

describe("outils de frontière — ce qu'un import est", () => {
  it("voit un import de type, un réexport et un import dynamique", () => {
    // `importeDe` voit tout, y compris ce que la compilation efface : c'est ce qui
    // le rend utile pour dire « ce module **mentionne** l'autre », et c'est aussi
    // pourquoi une garde de frontière ne peut pas se fonder dessus seule.
    const source = [
      'import { a } from "@/lib/voisin"',
      'import type { B } from "@/lib/voisin"',
      'export { c } from "@/lib/voisin"',
      'import "@/lib/voisin/effet"',
      'const d = await import("@/lib/voisin/dynamique")',
    ].join("\n")

    expect(importeDe(source, "lib/voisin")).toBe(true)
    expect(importeDe(source, "lib/voisin/effet")).toBe(true)
    expect(importeDe(source, "lib/voisin/dynamique")).toBe(true)
    expect(importeDe(source, "lib/autre")).toBe(false)
    expect(importeDe("export const x = 1\n", "lib/voisin")).toBe(false)
  })

  it("résout un chemin relatif par son dernier segment", () => {
    // Un spécifier relatif n'a pas de racine connu ; le comparer à son dernier
    // segment est la seule résolution possible, et c'est celle qui garde `./meili`
    // verrouillé pour `@/lib/meili`.
    expect(importeDe('import { meili } from "./meili"\n', "lib/meili")).toBe(
      true
    )
    expect(
      importeDe('import { meili } from "../lib/meili"\n', "lib/meili")
    ).toBe(true)
    expect(importeDe('import { x } from "./autre"\n', "lib/meili")).toBe(false)
  })

  it("ne laisse passer un emprunt de valeur que pour ce qu'il en est", () => {
    // **La distinction qui fonde `empruntsDeValeur`** : un `import type` est effacé
    // à la compilation, donc il ne franchit pas la frontière, et une garde fondée
    // sur `importeDe` serait **fausse** au lieu d'être verte — elle s'allumerait sur
    // une arête légitime.
    const carte = carteDe(
      ["lib/emprunteur.ts", 'import type { Base } from "@/lib/base"'],
      ["lib/base.ts", "export interface Base {}\n"]
    )
    expect(
      empruntsDeValeur(
        "lib/emprunteur.ts",
        carte.get("lib/emprunteur.ts")!.source,
        carte
      )
    ).toEqual([])
    expect(atteignables("lib/emprunteur.ts", carte).has("lib/base.ts")).toBe(
      false
    )

    const enValeur = carteDe(
      ["lib/emprunteur.ts", 'import { base } from "@/lib/base"'],
      ["lib/base.ts", "export const base = 1\n"]
    )
    expect(
      empruntsDeValeur(
        "lib/emprunteur.ts",
        enValeur.get("lib/emprunteur.ts")!.source,
        enValeur
      )
    ).toEqual([{ chemin: "lib/base.ts", specifieur: "@/lib/base" }])
    expect(atteignables("lib/emprunteur.ts", enValeur).has("lib/base.ts")).toBe(
      true
    )
  })
})

describe("outils de frontière — le parcours", () => {
  it('s\'arrête sur un module "use server", et ne franchit pas son graphe', () => {
    // Un module `"use server"` est remplacé côté client par une référence d'action :
    // son graphe reste serveur. Une action d'Administration appelle donc la Lecture
    // sans que le paquet navigateur ne la contienne — et c'est ce qui permet à la
    // garde du module de dire qu'il n'atteint aucun client.
    const carte = carteDe(
      [
        "lib/appelant.ts",
        'import { agir } from "@/lib/action"\nimport { base } from "@/lib/base"',
      ],
      ["lib/action.ts", '"use server"\nimport { base } from "@/lib/base"'],
      ["lib/base.ts", "export const base = 1\n"]
    )
    const atteints = atteignables("lib/appelant.ts", carte)

    expect(atteints.has("lib/action.ts")).toBe(true)
    expect(atteints.has("lib/base.ts")).toBe(true)
    // Le même voisinage, sans l'arrêt : c'est la contre-épreuve, sans elle le
    // parcours pourrait s'arrêter partout et le premier `has` passerait.
    const sansArret = carteDe(
      ["lib/appelant.ts", 'import { base } from "@/lib/base"'],
      ["lib/base.ts", "export const base = 1\n"]
    )
    expect(atteignables("lib/appelant.ts", sansArret).has("lib/base.ts")).toBe(
      true
    )
  })

  it("ignore un spécifier de paquet, faute de source dans le dépôt", () => {
    const carte = carteDe([
      "lib/appelant.ts",
      'import { x } from "meilisearch"\n',
    ])
    expect(
      empruntsDeValeur(
        "lib/appelant.ts",
        carte.get("lib/appelant.ts")!.source,
        carte
      )
    ).toEqual([])
    expect([...atteignables("lib/appelant.ts", carte)]).toEqual([
      "lib/appelant.ts",
    ])
  })

  it("ne se compte pas elle-même : les aides sont hors du graphe de la graine", () => {
    // Une garde qui s'appuierait sur les aides partagées ne doit pas se compter
    // elle-même dans le graphe qu'elle annonce : c'est l'affirmation que la garde du
    // cœur et celle de la Lecture portent toutes deux, et elle tient ici parce que
    // la graine est un module qui n'en importe aucune.
    const carte = carteDe(["lib/neutre.ts", "export const x = 1\n"])
    expect([...atteignables("lib/neutre.ts", carte)]).toEqual(["lib/neutre.ts"])
    expect(atteignables("lib/neutre.ts", carte).has(AIDE)).toBe(false)
  })
})

describe("outils de frontière — le corpus", () => {
  const production = sourcesDeProduction(import.meta.url, "..")
  const toutes = sourcesToutes(import.meta.url, ".")

  it("parcourt un arbre entier et se prouve non vacant", () => {
    // Le corpus est ce qui empêche un fichier neuf d'échapper à une garde écrite
    // sur une liste de noms. Il faut donc prouver qu'il est grand, et qu'il
    // contient ce qu'il doit contenir.
    expect(production.length).toBeGreaterThan(50)
    expect(production.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        AIDE,
        "lib/marche-structure.ts",
        "lib/use-cases/lecture-structure.ts",
      ])
    )
    expect(production.some(({ chemin }) => chemin.endsWith(".test.ts"))).toBe(
      false
    )
    // Les suites sont là pour qui veut une règle qui vaut aussi en recette, et
    // absentes quand elle ne vaut que pour la production.
    expect(toutes.map(({ chemin }) => chemin)).toContain(
      AIDE.replace(".ts", ".test.ts")
    )
  })

  it("lit un fichier par rapport au `import.meta.url` de la suite appelante", () => {
    // Chaque garde garde ses chemins relatifs à son propre dossier ; c'est ce qui
    // permet à une suite de `lib/` et à une suite d'`app/` d'appeler `lire` avec le
    // même nom.
    const source = lire(import.meta.url, "./outils-frontiere.ts")
    expect(source).toContain("export function directive")
    expect(source).toContain("export function atteignables")
  })
})
