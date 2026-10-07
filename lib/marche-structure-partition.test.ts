import { describe, expect, it, vi } from "vitest"

import {
  complementDe,
  descendanceDe,
  type PartitionStructure,
  type StructureLue,
} from "@/lib/marche-structure"

/**
 * La primitive de la Structure et son complément, par la porte pure.
 *
 * **Ce sont les deux seules projections dont la boîte de suppression a besoin,
 * et la spec les veut prouvées ici, sur des faits.** La boîte rend deux listes de
 * cibles — tout sauf la Structure supprimée, et tout sauf cette Structure *et*
 * sa descendance — qu'elle ne calcule plus : elle les reçoit (US 40, ADR-0028).
 * Une règle de domaine qui vit dans un composant `"use client"` est une règle
 * qu'une surface réécrira ; celle-ci se prouve donc en amont, sur des littéraux,
 * sans PostgreSQL et sans rendu (US 41).
 *
 * **Le fait qui porte la preuve est une identité, pas deux jeux d'attente.** Les
 * deux listes ne sont pas « ce que l'une devrait contenir » et « ce que l'autre
 * devrait contenir » : elles se partagent une cause, et c'est leur **différence**
 * qui vaut un fait — ce qui sépare « tout sauf soi » de « tout sauf soi et ses
 * descendantes », c'est exactement la descendance, ni plus ni moins. L'épreuve la
 * parcourt sur **toute** la fixture et sur chaque Structure qu'elle porte,
 * parce qu'une identité vérifiée sur un exemple est un exemple, pas une
 * identité.
 *
 * **L'ordre est une promesse, et elle est lisible.** Les trois listes — la
 * primitive et les deux listes du complément — se lisent dans l'ordre que le
 * module promet : le nom en français, départagé par l'identifiant. Ce n'est pas
 * l'ordre de la traverse, qui dépend de l'ordre des rangées qu'une lecture a
 * rendues, donc de la collation d'un serveur de base qu'aucun déploiement
 * n'épingle : la même promesse que l'arbre d'accueil tient, et elle se tient au
 * même endroit — en JavaScript (US 30, US 31).
 *
 * **La terminaison se prouve ici encore, pas seulement dans le cœur.** Une
 * chaîne qui mène à un cycle et une descente depuis une Structure qu'aucune
 * racine n'atteint sont deux formes ordinaires de la donnée corrompue ; cette
 * épreuve les éprouve sur les listes que la boîte rendra, et c'est ce qui sera
 * lu dans un sélecteur.
 */

/** Une Structure en littéral : les trois faits que la marche consomme. */
function structure(id: string, name: string, parentId: string | null) {
  return { id, name, parentId }
}

/**
 * L'arbre ordinaire, à côté duquel la corruption se lit. La branche de droite
 * porte un enfant nommé « Alpha Petit » : son nom le range **avant** son propre
 * parent, donc la fixture distingue l'ordre que le module promet d'un ordre
 * d'arbre. C'est voulu — la promesse porte sur le nom, et une preuve qui ne la
 * mettrait pas à l'épreuve ne la prouverait pas.
 *
 *     racine ─┬─ enfant-a ─── petit-a        (Petit A)
 *             └─ enfant-b ─── alpha-petit     (Alpha Petit)
 *     isolee
 */
const ARBRE_SAIN: StructureLue[] = [
  structure("racine", "Racine", null),
  structure("enfant-a", "Enfant A", "racine"),
  structure("enfant-b", "Enfant B", "racine"),
  structure("petit-a", "Petit A", "enfant-a"),
  structure("alpha-petit", "Alpha Petit", "enfant-b"),
  structure("isolee", "Isolée", null),
]

/**
 * Un cycle que deux amont mènent à, à côté d'une branche saine — repris tel quel
 * par les épreuves du complément : une liste de cibles se lit aussi sur une
 * donnée corrompue, et c'est là qu'on verrait une liste qui refuse au lieu de
 * rendre.
 *
 *     racine ─── enfant
 *     amont-1 ──┐
 *               ├─ boucle-a ⇄ boucle-b
 *     amont-2 ──┘
 */
const CYCLE: StructureLue[] = [
  structure("racine", "Racine", null),
  structure("enfant", "Enfant", "racine"),
  structure("amont-1", "Amont 1", "boucle-a"),
  structure("amont-2", "Amont 2", "boucle-a"),
  structure("boucle-a", "Boucle A", "boucle-b"),
  structure("boucle-b", "Boucle B", "boucle-a"),
]

/** Les identifiants d'une liste, sans leur ordre : un ensemble est un ensemble. */
function enEnsemble(ids: readonly string[]): Set<string> {
  return new Set(ids)
}

/** La différence de deux listes, comme un ensemble : `a` moins `b`. */
function difference(a: readonly string[], b: readonly string[]): Set<string> {
  return new Set(a.filter((id) => !b.includes(id)))
}

/** Deux listes qui se croisent : le seul cas que la partition exclut. */
function seCroisent(a: readonly string[], b: readonly string[]): boolean {
  return a.some((id) => b.includes(id))
}

describe("descendanceDe — la primitive", () => {
  it("rend la Structure d'abord, puis ses descendantes dans l'ordre du module", () => {
    const descendance = descendanceDe(ARBRE_SAIN, "racine")

    // La Structure nommée ouvre la liste : c'est elle qu'on a demandée, et le
    // reste se lit ensuite dans l'ordre que le module promet — le nom en
    // français. « Alpha Petit » vient donc avant « Enfant B » bien qu'il soit
    // plus profond, et « Isolée » n'y est pas : elle n'en descend pas.
    expect(descendance).toEqual([
      "racine",
      "alpha-petit",
      "enfant-a",
      "enfant-b",
      "petit-a",
    ])
  })

  it("rend une Structure sans descendante elle seule", () => {
    expect(descendanceDe(ARBRE_SAIN, "isolee")).toEqual(["isolee"])
    expect(descendanceDe(ARBRE_SAIN, "petit-a")).toEqual(["petit-a"])
  })

  it("rend une Structure absente des faits sans lever", () => {
    // Une lecture peut nommer une rangée que sa projection ne couvre pas — un
    // filtre en amont, une suppression entre deux lectures. La dégradée est celle
    // de la marche : elle rend la seule Structure qu'elle connaît, celle qu'on
    // lui a nommée, et ne refuse rien (ADR-0030).
    expect(descendanceDe(ARBRE_SAIN, "inconnue")).toEqual(["inconnue"])
    expect(descendanceDe([], "inconnue")).toEqual(["inconnue"])
  })

  it("ne rend jamais deux fois la même Structure", () => {
    const descendance = descendanceDe(ARBRE_SAIN, "racine")

    // La règle de terminaison de la marche, vue par la liste : « chacune au plus
    // une fois ». Une liste qui répéterait une Structure proposerait deux fois la
    // même cible, et une branche apparaîtrait deux fois dans un sélecteur.
    expect(new Set(descendance).size).toBe(descendance.length)
  })
})

describe("descendanceDe — sur une Structure déjà cyclique", () => {
  it("rend le cycle et ce qui y mène, chacun une fois", () => {
    const descendance = descendanceDe(CYCLE, "boucle-a")

    // Les deux maillons du cycle sont là : la descente s'arrête sur la revisite
    // de `boucle-a`, elle ne refuse pas de rendre la boucle. Et les deux amont,
    // enfants de `boucle-a` et non maillons du cycle, sont là aussi — c'est ce
    // qui distingue « la branche d'une Structure » de « les maillons d'une
    // boucle ».
    expect(descendance).toEqual(["boucle-a", "amont-1", "amont-2", "boucle-b"])
    expect(new Set(descendance).size).toBe(descendance.length)
  })

  it("rend le même ensemble par chacun des deux maillons du cycle", () => {
    // Aucun maillon n'est privilégié : la branche d'une Structure corrompue ne
    // dépend pas du point d'entrée, sans quoi la liste que la boîte rendrait
    // dépendrait de la ligne qu'elle se trouve avoir ouverte.
    expect(enEnsemble(descendanceDe(CYCLE, "boucle-b"))).toEqual(
      enEnsemble(descendanceDe(CYCLE, "boucle-a"))
    )
  })

  it("rend une Structure qu'aucune racine n'atteint, sans lever", () => {
    // `amont-1` est hors arbre : aucune racine ne l'atteint. La primitive rend
    // ce qui est en base — elle n'est pas le lieu d'un jugement — et elle se
    // termine quand même.
    expect(descendanceDe(CYCLE, "amont-1")).toEqual(["amont-1"])
    expect(descendanceDe(CYCLE, "amont-2")).toEqual(["amont-2"])
  })

  it("journalise le cycle une fois, en nommant les Structures", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      descendanceDe(CYCLE, "boucle-a")

      // Une ligne, qui nomme la boucle : c'est elle qui dit à un éditeur quelles
      // rangées réparer. La liste rendue ne nomme personne — elle ne rend que des
      // identifiants — donc le journal est le seul endroit où le nom se lit.
      expect(warn).toHaveBeenCalledTimes(1)
      const ligne = warn.mock.calls[0]!.join(" ")
      expect(ligne).toContain("Boucle A")
      expect(ligne).toContain("Boucle B")
    } finally {
      warn.mockRestore()
    }
  })
})

describe("descendanceDe — une longueur n'est jamais un refus", () => {
  /**
   * Un cycle **au bout** d'une chaîne de plusieurs milliers de maillons. La
   * taille est celle que le cœur pur emploie déjà : aucune profondeur maximale
   * n'est une règle de ce dépôt, et une borne implicite ne doit pas se glisser
   * dans une projection (ADR-0027, ADR-0030).
   */
  const PROFONDEUR = 5_000

  /**
   * Une chaîne de `PROFONDEUR` maillons suspendue sous la boucle à sa **tête** :
   * la racine de la chaîne a la boucle pour parente, donc aucune Structure de la
   * table n'est une racine — la boucle, la chaîne et tout ce qui pend d'elles
   * sont hors arbre. C'est la forme la plus difficile des deux : descendre depuis
   * un maillon du cycle ramène toute la chaîne, et c'est ce que la boîte rendrait
   * pour la Structure d'une ligne dont la branche est ainsi corrompue.
   */
  function chaineSousUnCycle(): StructureLue[] {
    const chaine: StructureLue[] = [structure("racine", "Racine", "boucle-a")]
    for (let rang = 1; rang < PROFONDEUR; rang += 1) {
      chaine.push(
        structure(
          `c${rang}`,
          `Maillon ${rang}`,
          rang === 1 ? "racine" : `c${rang - 1}`
        )
      )
    }
    return [
      ...chaine,
      structure("boucle-a", "Boucle A", "boucle-b"),
      structure("boucle-b", "Boucle B", "boucle-a"),
    ]
  }

  it("descend une chaîne qui mène à un cycle, et s'arrête", () => {
    const debut = Date.now()
    const descendance = descendanceDe(chaineSousUnCycle(), "racine")
    const duree = Date.now() - debut

    // Toute la chaîne, à cinq mille niveaux de la boucle, et chaque maillon une
    // fois : c'est la branche d'une Structure profonde, pas un refus pour
    // longueur. Aucune profondeur maximale n'est une règle de ce dépôt
    // (ADR-0027, ADR-0030).
    expect(descendance).toHaveLength(PROFONDEUR)
    expect(descendance[0]).toBe("racine")
    expect(enEnsemble(descendance)).toContain(`c${PROFONDEUR - 1}`)
    expect(new Set(descendance).size).toBe(descendance.length)

    // Une borne large : elle refuse le quadratique, elle ne mesure pas la
    // performance. Un tri par nom sur cinq mille maillons reste linéaire en
    // logarithme ; une carte de liens reconstruite à chaque maillon ne tiendrait
    // pas dans cette borne.
    expect(duree).toBeLessThan(2_000)
  })

  it("descend depuis une Structure qu'aucune racine n'atteint, et s'arrête", () => {
    const debut = Date.now()
    // `boucle-a` n'est atteinte par aucune racine : la table n'en a pas une.
    // C'est la forme la plus difficile, puisque sa descente ramène toute la
    // chaîne pendue sous elle, en plus des deux maillons de la boucle.
    const descendance = descendanceDe(chaineSousUnCycle(), "boucle-a")
    const duree = Date.now() - debut

    // Les deux maillons de la boucle et les `PROFONDEUR` maillons de la chaîne,
    // chacun une fois. Le cycle se referme sur lui-même sans rien répéter, et
    // c'est ce qui fait que la liste est finie.
    expect(descendance).toHaveLength(PROFONDEUR + 2)
    expect(descendance[0]).toBe("boucle-a")
    expect(enEnsemble(descendance)).toContain("boucle-b")
    expect(enEnsemble(descendance)).toContain(`c${PROFONDEUR - 1}`)
    expect(new Set(descendance).size).toBe(descendance.length)

    expect(duree).toBeLessThan(2_000)
  })
})

describe("complementDe — les deux listes de la boîte", () => {
  it("rend tout sauf la Structure, et tout sauf elle et sa descendance", () => {
    const partition = complementDe(ARBRE_SAIN, "enfant-a")

    // Les deux listes, lues par la boîte : la première reçoit un Produit quel que
    // soit l'endroit où il atterrit, la seconde reçoit une sous-catégorie — et un
    // Produit posé sous une descendante refermerait la boucle sur elle-même.
    expect(partition).toEqual({
      descendance: ["enfant-a", "petit-a"],
      horsSoi: ["alpha-petit", "enfant-b", "isolee", "petit-a", "racine"],
      horsDescendance: ["alpha-petit", "enfant-b", "isolee", "racine"],
    } satisfies PartitionStructure)
  })

  it("rend des cibles, jamais un choix déjà validé", () => {
    // Sur un cycle déjà en base, la liste rend des identifiants sans lever et
    // sans rien retirer : la boîte **propose**, le serveur seul refuse. Une liste
    // qui écartait d'elle-même une cible cyclique rendrait les deux surfaces
    // identiques, et c'est la divergence d'ADR-0030 (US 17).
    const partition = complementDe(CYCLE, "boucle-a")

    expect(partition.descendance).toContain("boucle-b")
    expect(partition.horsSoi).toContain("boucle-b")
    // La descendance est écartée des sous-catégories — c'est sa seule raison
    // d'être écartée — et rien d'autre ne l'est.
    expect(partition.horsDescendance).not.toContain("boucle-b")
    expect(partition.horsDescendance).toContain("racine")
  })

  it("ne rend que des chaînes : rien d'appelable ne franchit la couture", () => {
    // Ce qui traverse la frontière client/serveur, ce sont des identifiants et
    // des noms (ADR-0028) : aucune fonction, aucun getter, aucune instance. Une
    // forme plus grande qu'une constante, pas différente.
    const partition = complementDe(ARBRE_SAIN, "enfant-a")
    for (const liste of [
      partition.descendance,
      partition.horsSoi,
      partition.horsDescendance,
    ]) {
      expect(liste.length).toBeGreaterThan(0)
      for (const valeur of liste) {
        expect(typeof valeur).toBe("string")
      }
    }
  })
})

describe("complementDe — les deux listes ne diffèrent que par la descendance", () => {
  it("diffère de la première exactement des descendantes, sur toute la fixture", () => {
    // L'identité, éprouvée pour **chaque** Structure de l'arbre — pas pour un
    // exemple choisi. `horsSoi \ horsDescendance` rend les descendantes **moins
    // la Structure elle-même**, puisque celle-ci est absente des deux listes :
    // c'est le seul écart que la différence doive porter, et il ne doit en
    // porter aucun autre.
    const tous = ARBRE_SAIN.map((fait) => fait.id)

    for (const id of tous) {
      const { descendance, horsSoi, horsDescendance } = complementDe(
        ARBRE_SAIN,
        id
      )
      const attendues = descendance.filter((atteint) => atteint !== id)

      expect(difference(horsSoi, horsDescendance), id).toEqual(
        enEnsemble(attendues)
      )
      expect(difference(horsDescendance, horsSoi), id).toEqual(new Set())
      // Et la même identité par la quantité : ce que la seconde liste retire à la
      // première, elle le rend dans la primitive, à l'exacte quantité.
      expect(horsSoi.length - horsDescendance.length, id).toBe(attendues.length)
    }
  })

  it("partage toute la table en deux, sans rien perdre ni répéter", () => {
    // L'autre moitié de l'identité, celle qui rend la partition entière. La
    // primitive et la liste des sous-catégories se partagent les Structures,
    // chacune une fois : une liste qui perdrait une Structure proposerait un
    // Produit orphelin sans le dire, et une liste qui en gagnerait deux
    // proposerait la même cible deux fois.
    const tous = ARBRE_SAIN.map((fait) => fait.id)

    for (const id of tous) {
      const { descendance, horsSoi, horsDescendance } = complementDe(
        ARBRE_SAIN,
        id
      )

      expect(seCroisent(descendance, horsDescendance), id).toBe(false)
      expect(new Set([...descendance, ...horsDescendance]), id).toEqual(
        enEnsemble(tous)
      )

      // Et l'autre liste se partage la table avec la seule Structure qu'elle a
      // écartée : « tout sauf soi » retire un élément, pas une branche.
      expect(horsSoi.includes(id), id).toBe(false)
      expect(new Set([...horsSoi, id]), id).toEqual(enEnsemble(tous))

      for (const liste of [descendance, horsSoi, horsDescendance]) {
        expect(new Set(liste).size, id).toBe(liste.length)
      }
    }
  })

  it("tient la même identité sur une table déjà cyclique", () => {
    // L'identité ne dépend pas de l'acyclicité : sur un cycle déjà en base, les
    // deux listes rendent des identifiants, la primitive rend la branche, et la
    // différence reste exactement la descendance. C'est ce qui permet à la boîte
    // de proposer des cibles sans savoir si la donnée est saine.
    const tous = CYCLE.map((fait) => fait.id)

    for (const id of tous) {
      const { descendance, horsSoi, horsDescendance } = complementDe(CYCLE, id)
      const attendues = descendance.filter((atteint) => atteint !== id)

      expect(difference(horsSoi, horsDescendance), id).toEqual(
        enEnsemble(attendues)
      )
      expect(new Set([...descendance, ...horsSoi]), id).toEqual(
        enEnsemble(tous)
      )
    }
  })
})
