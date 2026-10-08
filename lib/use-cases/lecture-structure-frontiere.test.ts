import { describe, expect, it } from "vitest"

import {
  atteignables,
  directive,
  empruntsDeValeur,
  importeDe,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

/**
 * Frontière de la Lecture de la Structure — deux gardes, deux portes du même
 * tranchant.
 *
 * `lib/use-cases/lecture-structure.ts` est le module serveur qui **possède** la
 * lecture de la table `Category` (ADR-0030). Il n'est donc pas neutre : il atteint
 * la base, et le garderait-on neutre que la boutique perdrait son arbre, son fil
 * d'Ariane et son filtre de Produits. La preuve qu'il faut n'est donc pas qu'il
 * est neutre, c'est **qu'il n'est atteint par aucun module client** — la
 * question inverse de celle que pose le cœur, et l'instrument est le même.
 *
 * **Les deux gardes sont inverses l'une de l'autre, et c'est ce qui les rend
 * possibles sans rien inventer.** Le cœur neutre (`lib/marche-structure.ts`) ne
 * doit atteindre ni la base ni un module client ; la Lecture, au-dessus, doit
 * atteindre la base et ne doit atteindre **aucun** module client. Les deux se
 * lisent avec les mêmes trois primitives — `sourcesDeProduction` pour le corpus,
 * `atteignables` pour le parcours, `directive` pour le côté que chaque module
 * réclame — et le spec (#564, § Further Notes) le dit ainsi : deux coutures de
 * la même garde.
 *
 * **Un garde écrit sur une liste de noms est le piège qu'ADR-0028 nomme.** Il
 * s'allume sur un client neuf qui n'a rien à reprocher — une liste à maintenir,
 * donc une panne de vraisemblance — et il reste muet sur celui qui importerait,
 * parce que personne ne l'a ajouté à la liste. Les deux gardes ci-dessous
 * dérivent donc leurs clients de leur **directive** et leurs lecteurs de leur
 * **source**, jamais d'une liste de chemins. Le prix se paie dans le témoin de
 * non-vacuité, qui oblige à nommer ce qui entre.
 *
 * **La seconde garde est le seuil du spec, et il n'en existait pas.** Les douze
 * gardes du dépôt gardent un *sujet* — le SDK Meili hors de son adaptateur, la
 * couture du formulaire, le cœur de la Marche. Celle-ci garde une **table** :
 * elle demande si `Category` est lue ailleurs que chez son propriétaire, et
 * répond en nommant chaque lecteur qui reste. C'est la première liste blanche de
 * seuil du dépôt, et son instrument est écrit ici plutôt que repris d'un modèle —
 * d'où les deux décisions qui demandaient un arbitrage, énoncées plus bas
 * (**quelle délégation compte comme une lecture**) et signalées par le seed
 * (**qui n'est pas une surface**).
 *
 * Le parcours lit `app/`, `components/`, `lib/` **et `prisma/`** entiers,
 * production seule, `*.test.*` exclues : c'est la seule façon qu'un fichier neuf
 * n'échappe pas à une garde, et l'ajout de `prisma/` est délibéré plutôt que
 * subi — voir la garde de seuil et son entrée `prisma/seed.ts`. Les actions
 * d'Administration ne sont pas soumises à la première garde : une action est un
 * module `"use server"`, donc `atteignables` s'arrête dessus, et
 * `app/admin/actions-frontiere.test.ts` garde déjà ce qu'elles empruntent aux
 * modules clients (ADR-0028).
 */

const MODULE_LECTURE = "lib/use-cases/lecture-structure.ts"
const COEUR = "lib/marche-structure.ts"
const BASE = "lib/db.ts"
const AIDE_FRONTIERE = "lib/use-cases/outils-frontiere.ts"

/**
 * Le module client dont la source sert de témoin : la boîte de suppression, le
 * seul module `"use client"` qui ait atteint la Marche (#551) et qui l'a perdue
 * (#573). Elle est **dans** le corpus, elle réclame bien le côté client, et son
 * graphe ne touche ni la base ni la Lecture : les trois faits sont vérifiés,
 * parce qu'un témoin qu'on ne reconnaît pas ne prouve rien.
 */
const CLIENT_TEMOIN = "components/admin/delete-category-button.tsx"

/**
 * Ce que le module doit porter, énoncé symbole par symbole : un fichier vidé, ou
 * réduit à une seule porte de lecture, passerait pour un module qui ne lit rien
 * — donc pour un module dont la neutralité serait vacuë. Les six portes de
 * lecture sont les six questions que les surfaces ont posées (#567, #568, #570,
 * #571, #572, #576) ; les six projections pures sont leur porte jumelle, sans
 * lecture, et le réexport du cœur les accompagne.
 */
const SYMBOLES = [
  "lireArbreAccueil",
  "projeterArbreAccueil",
  "lireLignesAdmin",
  "projeterLignesAdmin",
  "lireOptionsSelecteur",
  "projeterOptionsSelecteur",
  "lireEcranEdition",
  "projeterEcranEdition",
  "lirePageCategorie",
  "projeterPageCategorie",
  "lireFilAriane",
  "projeterFilAriane",
  "FaitStructure",
  "NoeudAccueil",
  "LigneStructureAdmin",
  "OptionStructure",
  "StructureEditable",
  "EcranEditionStructure",
  "MaillonAriane",
  "PageCategorie",
  "descendanceDe",
  "complementDe",
] as const

/**
 * Les chemins que le module **ne doit pas** atteindre : les surfaces qui le
 * traversent — la boutique et l'Administration lisent par lui, elles ne sont pas
 * en dessous — et le module des mutations, qui garde ses lectures sous le verrou
 * grossier (ADR-0027) et n'a rien à emprunter à un module qui lit hors
 * transaction. Un `"use server"` est de toute façon un arrêt du parcours ; ces
 * chemins sont donc vérifiés pour qu'une arête de valeur vers l'un d'eux
 * s'allume, quelle que soit la façon dont elle est écrite.
 */
const CHEMINS_INTERDITS = [
  "lib/use-cases/storefront.ts",
  "lib/use-cases/admin-structure.ts",
  "lib/use-cases/admin-catalog.ts",
  "lib/use-cases/search.ts",
  "lib/use-cases/admin-dashboard.ts",
] as const

/**
 * Le seuil, énoncé comme une **liste blanche de lecteurs** : tous les fichiers de
 * production qui lisent la table `Category`, et la raison pour laquelle chacun la
 * lit. Ce n'est pas une liste de contrôle — elle n'énumère pas ce qui est permis,
 * elle énumère ce qui existe, et la garde échoue dès qu'un lecteur de plus
 * apparaît. Un `prisma.category.findMany` glissé dans une page fait donc tomber
 * la garde, et le message nomme le fichier à corriger.
 *
 * Les quatre entrées sont de trois natures, et les confondre serait réécrire la
 * règle :
 *
 * - **Le propriétaire.** Il lit le surensemble une fois par exécution et en tire
 *   tout : arbre d'accueil, lignes d'Administration, options d'un sélecteur,
 *   écran d'édition, page de catégorie, fil d'Ariane (ADR-0030).
 * - **Les deux exceptions que l'en-tête du module nomme.** Les noms d'une facette,
 *   lus par slug pour une distribution de résultats de recherche
 *   (`lib/use-cases/search.ts` — la lecture traverse la couture du moteur et rend
 *   une entrée qui n'est pas en base, ADR-0029) ; et le compte de Structures du
 *   tableau de bord d'Administration (`lib/use-cases/admin-dashboard.ts`). Ni
 *   l'une ni l'autre n'est une marche, ni ne veut l'être : la première ne rend
 *   qu'un nom pour une distribution, la seconde ne rend qu'un entier. Le module
 *   les nomme pour que la prochaine se lise comme une décision.
 * - **Le seed**, qui n'est pas une surface : `prisma/seed.ts` écrit les
 *   Structures, puis relit par slug la rangée qu'il vient d'écrire pour y
 *   rattacher les Produits du jeu d'essai. C'est un **outillage
 *   d'exploitation**, lancé par un opérateur et jamais par une page ; ce qu'il
 *   relit n'est pas un fait de catalogue mais la clé qu'il vient de poser. Le
 *   nommer ici plutôt que l'ignorer est un choix : un seuil qui se tait sur un
 *   fichier qu'il a sous les yeux est un seuil qui ne sait pas ce qu'il couvre.
 *
 * **Ce qui n'est pas dans la liste, et pourquoi ce n'est pas un oubli.**
 * `lib/use-cases/admin-structure.ts` lit aussi `Category` — mais sur le client de
 * la transaction (`tx.category.findUnique`, `client.category.findUnique`) : ce
 * sont les lectures que les mutations jugent sur des faits engagés, et ADR-0027
 * les leur laisse sous le verrou grossier. La Lecture en est dispensée deux fois :
 * par la décision qu'elle prend (elle ne lit jamais en transaction) et par la
 * forme de son expression (elle nomme le client partagé, pas le modèle).
 */
const LECTEURS_NOMMES = new Map<string, string>([
  [MODULE_LECTURE, "le propriétaire de la lecture (ADR-0030)"],
  [
    "lib/use-cases/search.ts",
    "exception nommée : les noms d'une facette, lus par slug (ADR-0029)",
  ],
  [
    "lib/use-cases/admin-dashboard.ts",
    "exception nommée : le compte de Structures du tableau de bord",
  ],
  [
    "prisma/seed.ts",
    "outillage d'exploitation : la rangée que le seed vient d'écrire",
  ],
])

/**
 * Les délégations d'**écriture** de Prisma sur un modèle. Ce qui n'est pas dans
 * cette liste est une lecture — c'est le sens de l'expression, et non un
 * inventaire d'exemples : `aggregate`, `groupBy`, et toute délégation que Prisma
 * ajoutera demain sont donc vues sans qu'on ait à revenir ici. L'asymétrie est
 * délibérée : une liste de permissions se périme en oubliant une délégation, une
 * liste d'exceptions se périme en en ajoutant une.
 *
 * Ce sont des écritures, pas des lectures : elles appartiennent aux mutations,
 * qui écrivent sous le verrou (ADR-0027), et au seed qui amorce une base. Une
 * surface qui écrirait une Structure aurait un problème d'un autre genre, et le
 * seuil d'aujourd'hui n'est pas celui-là.
 */
const ECRITURES_DELEGUEES = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "delete",
  "deleteMany",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
])

/**
 * `prisma.category.<délégation>` : le délégué de la Structure, atteint par le
 * client partagé que `lib/db.ts:7` exporte.
 *
 * **L'expression dit `prisma.category`, et non `category.<délégation>`, et ce
 * n'est pas une approximation de lecture.** Les lectures que les mutations jugent
 * sur des faits engagés s'écrivent `tx.category.findUnique` et
 * `client.category.findUnique` (`lib/use-cases/admin-structure.ts:322, 337,
 * 525, 618`) : un client de transaction, donc un fait sous le verrou grossier,
 * qu'ADR-0027 laisse aux mutations. Une expression `/category\.findUnique/`
 * les attraperait, et la garde serait **fausse** au lieu d'être verte — le
 * défaut que `outils-frontiere.ts:16-21` nomme pour `importeDe`, reproduit ici
 * par un autre chemin. Celle-ci épargne les lectures transactionnelles parce
 * qu'elles ne passent pas par le client partagé, et c'est le même fait qui décide
 * du reste : le seuil porte sur *la lecture d'une surface*, pas sur la validation
 * d'une mutation.
 */
const DELEGUE_DE_LA_STRUCTURE =
  /\bprisma\s*\.\s*category\s*\.\s*([A-Za-z_$][\w$]*)/g

/**
 * Le client Prisma généré s'ouvre sur cette bannière, et il faut l'exclure du
 * balayage : `lib/generated/prisma/models/Category.ts` **documente** chacune de
 * ses délégations par un exemple (`const category = await prisma.category
 * .findUnique({ … })`), donc une expression sur la source le lirait comme un
 * lecteur de la Structure — six lectures qui n'existent pas. Ce sont des exemples
 * dans des commentaires, produits par `prisma generate` et réécrits à chaque
 * génération : on ne les compte pas, on ne les corrige pas, et on ne les laisse
 * pas faire échouer une garde sur la production.
 *
 * Le même fait, lu à l'envers, **prouve** que l'exclusion ne fait pas de vide :
 * si le client généré ne portait aucune occurrence, il n'aurait rien à exclure.
 * La suite le vérifie, sinon l'exclusion serait une façon de se taire sans le
 * dire.
 */
const BANIERE_GENEREE = "/* !!! This is code generated by Prisma."
const ARBORESCENCE_GENEREE = "lib/generated/"

/** Le chemin de dépôt dit-il qu'une source est du client Prisma généré ? */
function estGeneree(chemin: string): boolean {
  return chemin.startsWith(ARBORESCENCE_GENEREE)
}

/**
 * Les délégations de lecture de la Structure que la source déclare, une par
 * occurrence. L'ordre est celui du fichier, pour qu'un message nomme la première
 * ligne fautive.
 */
function lecturesDeLaStructure(source: string): string[] {
  return [...source.matchAll(DELEGUE_DE_LA_STRUCTURE)]
    .map(([, delegation]) => delegation!)
    .filter((delegation) => !ECRITURES_DELEGUEES.has(delegation))
}

/**
 * Les fichiers de production qui lisent la table, un chemin par fichier, pour
 * qu'un rapport dise où regarder. Le tri rend l'échec lisible ligne à ligne.
 */
function lecteurs(sources: readonly SourceProduction[]): string[] {
  return sources
    .filter(
      ({ chemin, source }) =>
        !estGeneree(chemin) && lecturesDeLaStructure(source).length > 0
    )
    .map(({ chemin }) => chemin)
    .sort()
}

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../../app",
  "../../components",
  "../../lib",
  "../../prisma"
)
const PAR_CHEMIN = new Map(SOURCES.map((source) => [source.chemin, source]))
const ATTEINTS = atteignables(MODULE_LECTURE, PAR_CHEMIN)

/** Les modules que le dépôt classe du côté client, déduits de leur directive. */
const MODULES_CLIENTS = SOURCES.filter(
  ({ source }) => directive(source) === "use client"
)

function sourceDe(chemin: string): SourceProduction {
  const trouvee = PAR_CHEMIN.get(chemin)
  if (!trouvee) throw new Error(`Source de production absente : ${chemin}`)
  return trouvee
}

/**
 * Une source du dépôt, une ligne insérée après la première. C'est la forme que
 * prennent les contre-épreuves : la suite n'invente ni chemin ni module, elle
 * fait varier la source d'un fichier **qui existe**, ce qui laisse au cas ses
 * voisins — dont la cible client — dans leur état véritable.
 */
function sourceApres(source: string, ligne: string): string {
  const premiere = source.split("\n")[0]!
  return `${premiere}\n${ligne}\n${source.slice(premiere.length)}`
}

/**
 * Les sources de la garde, celles des chemins donnés remplacées par d'autres.
 * Le remplacement se fait *en place*, sur le chemin réel du fichier : c'est ce
 * qui distingue une contre-épreuve d'un exemple, la violation vivant dans un
 * fichier du dépôt et non dans une suite.
 */
function avecSources(...remplacements: SourceProduction[]): SourceProduction[] {
  const remplaces = new Map(
    remplacements.map(({ chemin, source }) => [chemin, source])
  )
  return SOURCES.map((entree) => {
    const source = remplaces.get(entree.chemin)
    return source === undefined ? entree : { chemin: entree.chemin, source }
  })
}

/** Une seule source remplacée — la forme la plus courante. */
function avecSource(chemin: string, source: string): SourceProduction[] {
  return avecSources({ chemin, source })
}

/** La carte d'atteignables d'un jeu de sources, comme la garde les lit. */
function carte(
  sources: readonly SourceProduction[]
): Map<string, SourceProduction> {
  return new Map(sources.map((source) => [source.chemin, source]))
}

describe("Lecture de la Structure — le module n'atteint aucun module client", () => {
  it("le module lit la base et le cœur, et n'atteint aucune surface", () => {
    const { source } = sourceDe(MODULE_LECTURE)

    // Anti-vidage d'abord : un fichier vidé, ou réduit à une porte, passerait
    // pour un module qui ne lit rien — donc pour un module qui n'a rien à cacher.
    for (const symbole of SYMBOLES) {
      expect(source, symbole).toContain(symbole)
    }

    // Le module ne réclame aucun côté : c'est un module serveur, et un module
    // qui se réclamerait client serait réécrit par la transformation RSC — donc
    // ses faits ne seraient plus des faits mais des mandataires.
    expect(directive(source)).toBeNull()

    // **La forme positive, d'abord** : le module n'est pas neutre et ne doit pas
    // l'être. Sans cette preuve, « il n'atteint aucun module client » serait
    // aussi vrai d'un module qui n'atteindrait rien du tout.
    expect(PAR_CHEMIN.has(MODULE_LECTURE)).toBe(true)
    expect(ATTEINTS.has(MODULE_LECTURE)).toBe(true)
    expect(ATTEINTS.has(BASE), BASE).toBe(true)
    expect(ATTEINTS.has(COEUR), COEUR).toBe(true)

    // Et la forme négative, sur les voisins : les surfaces traversent le module,
    // il ne les traverse pas.
    for (const chemin of CHEMINS_INTERDITS) {
      expect(ATTEINTS.has(chemin), chemin).toBe(false)
    }

    // Aucun module atteint ne réclame de côté : le graphe du module est celui
    // d'une bibliothèque de serveur, et chaque fichier atteint est à son tour
    // contrôlé.
    for (const chemin of ATTEINTS) {
      const { source: atteinte } = sourceDe(chemin)
      expect(directive(atteinte), chemin).not.toBe("use client")
      expect(directive(atteinte), chemin).not.toBe("use server")
    }
  })

  it("aucun module client du dépôt n'atteint la Lecture", () => {
    // **L'inverse de la première garde, et sa raison d'être.** Le cœur garde sa
    // neutralité parce qu'il est atteint des deux côtés ; la Lecture ne peut pas
    // l'être, puisqu'elle lit la base — un composant `"use client"` qui
    // l'atteindrait tirerait `pg` (`require('dns')`) dans le bundle navigateur et
    // ferait tomber `next build` (Turbopack). C'est le défaut documenté par
    // `carte-produit-frontiere.test.ts` et `devis-frontiere.test.ts`.
    //
    // **Le balayage déduit ses clients de leur directive, il ne les nomme pas.**
    // Une liste de chemins s'allumerait sur un composant neuf qui n'a rien à
    // reprocher et resterait muet sur celui qui importerait : c'est le piège
    // nommé d'ADR-0028, et il vaut pour les gardes comme pour les actions. D'où
    // aussi l'instrument : `atteignables` suit les imports **de valeur** — la
    // sémantique du bundler — et s'arrête sur un module `"use server"`, que le
    // bundler remplace côté client par une référence d'action. `importeDe`, lui,
    // voit les imports de type, et une garde fondée dessus serait **fausse** au
    // lieu d'être verte (`outils-frontiere.ts:16-21`).
    expect(MODULES_CLIENTS.length).toBeGreaterThan(0)
    expect(MODULES_CLIENTS.map(({ chemin }) => chemin)).toContain(CLIENT_TEMOIN)
    for (const { chemin } of MODULES_CLIENTS) {
      expect(
        atteignables(chemin, PAR_CHEMIN).has(MODULE_LECTURE),
        `${chemin} → ${MODULE_LECTURE}`
      ).toBe(false)
    }
  })

  it("la dérivation des modules clients voit le prologue entier", () => {
    // L'auto-épreuve de l'instrument dont dépend le balayage ci-dessus.
    //
    // `directive` lisait la **première** entrée du prologue, ce qui suffisait tant
    // que le dépôt n'avait qu'une seule façon de s'ouvrir. Une source qui
    // ouvre par `"use strict";` puis réclame `"use client"` passait pourtant sous
    // le balayage : la garde aurait été verte par une absence de classement et
    // non par une absence d'arête. Le prologue est la suite des directives
    // d'ouverture ; la première n'en est pas plus une réclamation que les
    // suivantes.
    //
    // La limite assumée : les entrées doivent se suivre, sans commentaire entre
    // deux. Cacher une réclamation derrière un commentaire serait agir en
    // mauvaise foi ; on ne s'y prête pas.
    expect(directive('"use client"')).toBe("use client")
    expect(directive('"use server"')).toBe("use server")
    expect(directive('"use strict";\n"use client"')).toBe("use client")
    expect(directive('"use strict";\n"use server"\n')).toBe("use server")
    expect(directive('// @ts-check\n"use client"\n')).toBe("use client")
    // Et ce qui n'est pas une réclamation reste une chaîne ordinaire : c'est le
    // prologue qui décide, pas la présence du littéral.
    expect(directive('export const cote = "use client"\n')).toBeNull()
    expect(directive('const x = 1\n"use client"\n')).toBeNull()
    expect(directive("/* use client */\nexport const x = 1\n")).toBeNull()
  })

  it("le parcours est non vacuant : les quatre arbres sont visités, et la page trouve la Lecture", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(SOURCES.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        "app/(boutique)/page.tsx",
        "app/admin/categories/page.tsx",
        "app/admin/produits/[id]/page.tsx",
        CLIENT_TEMOIN,
        MODULE_LECTURE,
        // `prisma/` fait partie du parcours pour une raison énoncée dans la
        // garde de seuil : sans lui, le balayage se tait sur `prisma/seed.ts`
        // sans le dire. On l'affirme ici pour que l'entrée ne disparaisse pas
        // d'un balayage à l'autre.
        "prisma/seed.ts",
      ])
    )
    // Témoin positif : le même parcours, depuis une page qui doit atteindre la
    // Lecture, la trouve. Sans ce témoin, `ATTEINTS.has(BASE)` pourrait être
    // faux pour la seule raison que le parcours ne suit aucune arête.
    expect(
      atteignables("app/admin/produits/[id]/page.tsx", PAR_CHEMIN).has(
        MODULE_LECTURE
      )
    ).toBe(true)
    expect(ATTEINTS.has(AIDE_FRONTIERE)).toBe(false)
  })

  it("la garde tombe sur une violation synthétique, écrite dans un fichier réel", () => {
    // La contre-épreuve, dans les deux sens, parce que la garde a deux
    // affirmations : le module qui atteint un client, et le client qui atteint le
    // module.
    //
    // D'abord le module qui **atteint** un client : un composant client glissé
    // dans le module réel doit faire tomber la garde, puisque son graphe atteint
    // alors un fichier qui réclame le côté client.
    const reel = sourceDe(MODULE_LECTURE).source
    const enViolation = sourceApres(
      reel,
      'import { DeleteCategoryButton } from "@/components/admin/delete-category-button"'
    )
    expect(enViolation).not.toBe(reel)

    const carteEnViolation = carte(avecSource(MODULE_LECTURE, enViolation))
    // L'emprunt est nommé par son chemin résolu, comme dans
    // `app/admin/actions-frontiere.test.ts` : une violation se signale par la
    // ligne que le lecteur doit corriger.
    expect(
      empruntsDeValeur(MODULE_LECTURE, enViolation, carteEnViolation).map(
        ({ chemin }) => chemin
      )
    ).toContain(CLIENT_TEMOIN)

    const atteintsEnViolation = atteignables(MODULE_LECTURE, carteEnViolation)
    expect(atteintsEnViolation.has(CLIENT_TEMOIN)).toBe(true)
    // **La garde elle-même, sur le jeu de sources remplacement** : c'est
    // l'énoncé qu'elle vérifie, pas une reformulation de l'instrument.
    expect(
      [...atteintsEnViolation].filter(
        (chemin) => directive(sourceDe(chemin).source) === "use client"
      )
    ).not.toEqual([])

    // **Et la même arête, écrite en type, ne la fait pas tomber** : c'est la
    // distinction qui justifie `atteignables` plutôt qu'`importeDe`. La
    // frontière ne se traverse qu'en types — un `import type` est effacé à la
    // compilation (ADR-0028) — donc `importeDe` s'allumerait à tort, et une
    // garde fondée dessus serait fausse au lieu d'être verte.
    const enType = sourceApres(
      reel,
      'import type { DeleteCategoryButtonProps } from "@/components/admin/delete-category-button"'
    )
    expect(importeDe(enType, "components/admin/delete-category-button")).toBe(
      true
    )
    expect(
      atteignables(
        MODULE_LECTURE,
        carte(avecSource(MODULE_LECTURE, enType))
      ).has(CLIENT_TEMOIN)
    ).toBe(false)

    // Puis le client qui **atteint** la Lecture : une source de composant client
    // remplacée par une arête de valeur vers le module doit faire tomber le
    // balayage des clients, qui est l'autre moitié de la garde.
    const clientEnViolation = sourceApres(
      sourceDe(CLIENT_TEMOIN).source,
      'import { lireLignesAdmin } from "@/lib/use-cases/lecture-structure"'
    )
    expect(directive(clientEnViolation)).toBe("use client")
    expect(
      atteignables(
        CLIENT_TEMOIN,
        carte(avecSource(CLIENT_TEMOIN, clientEnViolation))
      ).has(MODULE_LECTURE)
    ).toBe(true)
  })
})

describe("Lecture de la Structure — le seuil de lecture", () => {
  it("l'instrument voit une lecture et épargne ce qui n'en est pas une", () => {
    // L'auto-épreuve de l'expression du seuil : sans elle, la garde pourrait être
    // verte parce qu'elle ne voit rien — une expression trop étroite
    // (`/prisma\.category\.findMany/`) serait verte sur un `count` glissé dans
    // une page.
    for (const delegation of [
      "findMany",
      "findUnique",
      "findUniqueOrThrow",
      "findFirst",
      "findFirstOrThrow",
      "count",
      "aggregate",
      "groupBy",
    ]) {
      expect(
        lecturesDeLaStructure(`await prisma.category.${delegation}()`),
        delegation
      ).toEqual([delegation])
    }

    // Les écritures ne sont pas des lectures : elles appartiennent aux
    // mutations et au seed (ADR-0027).
    for (const delegation of ECRITURES_DELEGUEES) {
      expect(
        lecturesDeLaStructure(`await prisma.category.${delegation}()`),
        delegation
      ).toEqual([])
    }

    // **Les lectures transactionnelles sont épargnées, et c'est l'arbitrage qui
    // décide de la garde.** `admin-structure.ts` lit `Category` sous le verrou
    // grossier, sur le client de la transaction ; ADR-0027 lui laisse ces
    // lectures, et la Lecture s'y astreint elle-même. Une expression
    // `/category\.findUnique/` les attraperait et la garde serait fausse.
    expect(
      lecturesDeLaStructure("const r = await tx.category.findUnique({})")
    ).toEqual([])
    expect(
      lecturesDeLaStructure("const r = await client.category.findUnique({})")
    ).toEqual([])
  })

  it("les écritures déclarées sont celles du client généré, pas des exemples", () => {
    // Le risque de l'expression n'est pas qu'elle voie trop : c'est qu'elle voie
    // trop **peu**. La garantie est donc prise du côté de Prisma : le client
    // généré **documente** chaque délégation du modèle, et toute délégation qu'il
    // documente est soit dans `ECRITURES_DELEGUEES`, soit vue comme une lecture.
    // Une délégation que Prisma ajouterait demain ne peut donc pas disparaître
    // dans le silence du seuil.
    const modele = sourceDe("lib/generated/prisma/models/Category.ts").source
    const documentees = new Set(
      [...modele.matchAll(/prisma\.category\.([A-Za-z]+)/g)].map(
        ([, delegation]) => delegation!
      )
    )
    expect(documentees.size).toBeGreaterThan(0)
    expect(documentees).toContain("findMany")
    expect(documentees).toContain("upsert")
    for (const delegation of ECRITURES_DELEGUEES) {
      expect(documentees, delegation).toContain(delegation)
    }
  })

  it("le client généré est exclu, et l'exclusion n'est pas un trou", () => {
    // Le client Prisma documenté écrit `prisma.category.*` dans ses exemples :
    // sans l'exclusion, la garde échouerait sur six lectures qui n'existent pas,
    // ou — pire — elle serait « corrigée » en élargissant la liste des lecteurs
    // nommés jusqu'à ce qu'elle ne dise plus rien.
    const generees = SOURCES.filter(({ chemin }) => estGeneree(chemin))
    expect(generees.length).toBeGreaterThan(0)
    for (const { chemin, source } of generees) {
      expect(source, chemin).toContain(BANIERE_GENEREE)
    }
    // **L'exclusion ne fait pas de vide** : le client généré contient bien les
    // occurrences que le seuil écarte. Si elles disparaissaient, l'exclusion
    // serait une façon de se taire sans le dire.
    expect(
      generees.filter(({ source }) => lecturesDeLaStructure(source).length > 0)
        .length
    ).toBeGreaterThan(0)
    expect(lecteurs(generees)).toEqual([])
  })

  it("la Structure n'est lue que par la Lecture et les trois lecteurs nommés", () => {
    // **Le seuil du spec : aucune lecture de la Structure hors du module qui la
    // possède, hormis les deux exceptions que son en-tête nomme — et le seed,
    // qui n'est pas une surface.** La garde est une liste blanche de *lecteurs*,
    // pas de fichiers autorisés : elle échoue dès qu'un lecteur de plus existe,
    // et le message nomme le fichier à corriger.
    expect(lecteurs(SOURCES)).toEqual([...LECTEURS_NOMMES.keys()].sort())
  })

  it("le seuil suit le nom du client partagé, et le dit", () => {
    // L'expression dit `prisma.category`, donc elle ne verrait pas un singleton
    // renommé. Le dépôt ne le renomme nulle part, et cette preuve est dans le
    // parcours plutôt que dans une convention : un `import { prisma as base }`
    // ferait tomber la garde, avec le fichier nommé.
    const renommes = SOURCES.flatMap(({ chemin, source }) =>
      [...source.matchAll(/\bprisma\s+as\s+([A-Za-z_$][\w$]*)\s+from/g)].map(
        ([, nom]) => `${chemin} → ${nom}`
      )
    )
    expect(renommes).toEqual([])
  })

  it("la garde nomme une lecture écrite hors du module, et se tait sur le reste", () => {
    // La contre-épreuve du seuil, dans les deux sens qu'il distingue.
    //
    // Une lecture glissée dans un vrai fichier de production — la boutique, qui
    // est passée par la Lecture (#566) et qui n'a plus le droit de lire la
    // table — doit être nommée par la garde.
    const boutique = "lib/use-cases/storefront.ts"
    const reel = sourceDe(boutique).source
    const enViolation = sourceApres(
      reel,
      "const avant = await prisma.category.findMany()"
    )
    expect(enViolation).not.toBe(reel)
    expect(lecteurs(avecSource(boutique, enViolation))).toEqual(
      [...LECTEURS_NOMMES.keys(), boutique].sort()
    )

    // **Et la même ligne, sur le client d'une transaction, ne la fait pas
    // tomber** : c'est l'arbitrage de l'expression, et il est rejoué à chaque
    // exécution plutôt que laissé à la lecture du commentaire.
    const enTransaction = sourceApres(
      reel,
      "const avant = await tx.category.findMany()"
    )
    expect(lecteurs(avecSource(boutique, enTransaction))).toEqual(
      [...LECTEURS_NOMMES.keys()].sort()
    )
  })
})
