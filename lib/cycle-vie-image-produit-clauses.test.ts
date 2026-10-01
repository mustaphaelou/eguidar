import { describe, expect, it } from "vitest"

import {
  classerRevendication,
  clauseComparaisonEchange,
  clauseReetiquetageExpire,
  reLabellableExpire,
} from "@/lib/cycle-vie-image-produit"

const DRAFT = "brouillon-1"
const PROPRIETAIRE = "editeur-1"
const AUTRE_PROPRIETAIRE = "editeur-2"
const TENTATIVE = "tentative-1"
const TENTATIVE_RIVALE = "tentative-2"
const PRODUIT = "produit-1"
const DEBUT = new Date("2026-08-01T10:00:00.000Z")
const MS_PAR_H = 60 * 60 * 1000
const RETENTION_H = 24
const EXPIRATION = new Date(DEBUT.getTime() + RETENTION_H * MS_PAR_H)
const APRES_RETENTION = new Date(EXPIRATION.getTime() + 1)

/**
 * Les six faits que le registre durable lit sur une rangée. La suite les écrit
 * elle-même : c'est l'interface dont se servent les deux clauses, et `tsc` la
 * revérifie des deux côtés. `state` y est large, comme la colonne.
 */
type Ligne = {
  state: string
  ownerId: string
  tentativeId: string | null
  expiresAt: Date
  productId: string | null
}

const LIGNES: Readonly<Record<string, Ligne>> = {
  "vivant revendable": {
    state: "vivant",
    ownerId: PROPRIETAIRE,
    tentativeId: null,
    expiresAt: EXPIRATION,
    productId: null,
  },
  "vivant, tentative restée": {
    state: "vivant",
    ownerId: PROPRIETAIRE,
    tentativeId: TENTATIVE,
    expiresAt: EXPIRATION,
    productId: null,
  },
  "vivant, déjà lié à un Produit": {
    state: "vivant",
    ownerId: PROPRIETAIRE,
    tentativeId: null,
    expiresAt: EXPIRATION,
    productId: PRODUIT,
  },
  "vivant, d'un autre éditeur": {
    state: "vivant",
    ownerId: AUTRE_PROPRIETAIRE,
    tentativeId: null,
    expiresAt: EXPIRATION,
    productId: null,
  },
  // Vivant, à son éditeur, sans tentative, rétention encore intacte à
  // l'instant de la revendication : la rangée que la clause de
  // comparaison-and-échange est faite pour prendre.
  "vivant, rétention intacte": {
    state: "vivant",
    ownerId: PROPRIETAIRE,
    tentativeId: null,
    expiresAt: APRES_RETENTION,
    productId: null,
  },
  // La même rangée, une milliseconde plus tôt. Aucune des conditions de la
  // clause de comparaison-and-échange n'est fausse, sauf une : la rétention est
  // échue au moment de la revendication. C'est la rangée qui dit à la clause ce
  // qu'elle ne doit pas écrire, et la seule des deux clauses qui la refuse.
  "vivant, rétention déjà échue": {
    state: "vivant",
    ownerId: PROPRIETAIRE,
    tentativeId: null,
    expiresAt: new Date(DEBUT.getTime() - 1),
    productId: null,
  },
  "rejeu de la même tentative": {
    state: "revendiqué",
    ownerId: PROPRIETAIRE,
    tentativeId: TENTATIVE,
    expiresAt: EXPIRATION,
    productId: null,
  },
  "revendiqué par une rivale": {
    state: "revendiqué",
    ownerId: PROPRIETAIRE,
    tentativeId: TENTATIVE_RIVALE,
    expiresAt: EXPIRATION,
    productId: null,
  },
  "revendiqué, rétention échue": {
    state: "revendiqué",
    ownerId: PROPRIETAIRE,
    tentativeId: TENTATIVE_RIVALE,
    expiresAt: APRES_RETENTION,
    productId: null,
  },
  libéré: {
    state: "libéré",
    ownerId: PROPRIETAIRE,
    tentativeId: null,
    expiresAt: EXPIRATION,
    productId: null,
  },
  "expiré, rétention non passée": {
    state: "expiré",
    ownerId: PROPRIETAIRE,
    tentativeId: null,
    expiresAt: EXPIRATION,
    productId: null,
  },
  "état que le registre ne connaît pas": {
    state: "état-inconnu",
    ownerId: PROPRIETAIRE,
    tentativeId: null,
    expiresAt: EXPIRATION,
    productId: null,
  },
}

/**
 * Un littéral de Prisma, lu tel que la clause le construit. Les trois formes
 * que le registre écrit — égalité, appartenance, borne temporelle — sont lues
 * l'une après l'autre sur la clause telle quelle, jamais sur une règle : c'est
 * ce qui permet à une clause éditée de se voir prise en défaut.
 */
function conditionTient(condition: unknown, fait: unknown): boolean {
  if (condition instanceof Date)
    return (fait as Date).getTime() === condition.getTime()
  if (condition !== null && typeof condition === "object") {
    const operateur = condition as Record<string, unknown>
    const [nom] = Object.keys(operateur)
    if (nom === "in") return (operateur.in as unknown[]).includes(fait)
    if (nom === "gt")
      return (fait as Date).getTime() > (operateur.gt as Date).getTime()
    if (nom === "lte")
      return (fait as Date).getTime() <= (operateur.lte as Date).getTime()
    throw new Error(`Opérateur de clause non géré : ${nom}`)
  }
  return fait === condition
}

/**
 * Ce que la clause retient d'une rangée, champ par champ. La comparaison est
 * exhaustive sur les champs de la clause : un champ ajouté s'applique, un champ
 * retiré cesse de s'appliquer. `id` est la clé de la rangée cherchée et n'en est
 * pas une condition ; chaque clause est vérifiée là-dessus à part.
 */
function retient(clause: Record<string, unknown>, ligne: Ligne): boolean {
  const { id: _cle, ...conditions } = clause
  return Object.entries(conditions).every(([fait, attendu]) =>
    conditionTient(attendu, ligne[fait as keyof Ligne])
  )
}

const TOUTES = Object.entries(LIGNES)

describe("la clause de réétiquetage est la transcription de la règle du réétiquetage", () => {
  const clause = clauseReetiquetageExpire({ id: DRAFT, now: APRES_RETENTION })

  it("nomme le Brouillon et l'instant qu'elle cherche", () => {
    expect(clause.id).toBe(DRAFT)
    expect(clause.expiresAt).toEqual({ lte: APRES_RETENTION })
  })

  it("retient les rangées que la règle autorise, à la rétention passée près", () => {
    // Deux questions, deux règles : `reLabellableExpire` dit ce qu'une rangée
    // peut devenir, la clause y ajoute l'instant — le sien, celui de l'appelant.
    // La clause est leur conjonction, et c'est ainsi qu'elle se compare.
    for (const [nom, ligne] of TOUTES) {
      const attendue =
        ligne.expiresAt <= APRES_RETENTION && reLabellableExpire(ligne)
      expect(retient(clause, ligne), nom).toBe(attendue)
    }
  })

  it("retient ce que la rétention a rattrapé, et rien d'autre", () => {
    // Nommée rangée par rangée, pour qu'une clause devenue muette se voie. Deux
    // détails la caractérisent : elle ignore l'éditeur, et elle ignore la
    // tentative restée. Un Brouillon ne se préserve pas de son auteur ni d'une
    // revendication qui a échoué à moitié — c'est ce que le libère est, et c'est
    // ce qui laisse les revendiqués se résoudre en `expiré` (histoire 25 de
    // l'issue #406). La clause de comparaison-and-échange, elle, ne peut pas se
    // permettre ces deux ignorances.
    const retenues = TOUTES.filter(([, ligne]) => retient(clause, ligne))
    expect(retenues.map(([nom]) => nom)).toEqual([
      "vivant revendable",
      "vivant, tentative restée",
      "vivant, d'un autre éditeur",
      "vivant, rétention intacte",
      "vivant, rétention déjà échue",
      "rejeu de la même tentative",
      "revendiqué par une rivale",
      "revendiqué, rétention échue",
    ])
  })

  it("tranche à l'instant de la rétention, comme la classification", () => {
    // La borne de la clause est la même règle que le barreau `expire` : la
    // rétention limite au moment où elle est atteinte, pas une milliseconde
    // après. Une clause qui trancherait ailleurs réétiqueterait un Brouillon
    // que la classification refuse encore.
    const limite = clauseReetiquetageExpire({ id: DRAFT, now: EXPIRATION })
    expect(retient(limite, LIGNES["vivant revendable"])).toBe(true)
    const avant = clauseReetiquetageExpire({
      id: DRAFT,
      now: new Date(EXPIRATION.getTime() - 1),
    })
    expect(retient(avant, LIGNES["vivant revendable"])).toBe(false)
  })
})

describe("la clause de comparaison-and-échange n'écrit que ce que le verdict autorise", () => {
  const contexte = { ownerId: PROPRIETAIRE, tentativeId: TENTATIVE, now: DEBUT }
  const clause = clauseComparaisonEchange({ id: DRAFT, ...contexte })

  const autorise = (ligne: Ligne) =>
    classerRevendication(ligne, contexte).kind === "a_ecrire"

  it("nomme le Brouillon qu'elle cherche", () => {
    expect(clause.id).toBe(DRAFT)
  })

  it("ne retient jamais une rangée que la classification refuse d'écrire", () => {
    // La sécurité de la comparaison-and-échange tient en une implication : ce
    // qu'elle écrit, la classification l'a autorisé. C'est elle qui fait la
    // règle au moment de la lecture, la clause qui la refait sous verrou, et les
    // deux doivent dire la même chose — sinon la base et le module divergent.
    for (const [nom, ligne] of TOUTES) {
      if (retient(clause, ligne)) {
        expect(autorise(ligne), nom).toBe(true)
      }
    }
  })

  it("retient les rangées qu'elle est faite pour prendre", () => {
    // L'autre moitié, vérifiée rangée par rangée : une revendication n'échoue
    // pas parce que la clause a oublié de dire `vivant`. La clause est plus
    // étroite que le verdict sur le reste des états — voir le cas suivant — mais
    // sur les rangées qu'elle sait prendre, elle doit les prendre.
    for (const nom of ["vivant revendable", "vivant, déjà lié à un Produit"]) {
      const ligne = LIGNES[nom]
      expect(autorise(ligne), nom).toBe(true)
      expect(retient(clause, ligne), nom).toBe(true)
    }
  })

  it("refuse d'écrire le rejeu d'une tentative qui a déjà pris la rangée", () => {
    // Le rejeu est un succès rendu par la classification, pas une écriture : la
    // clause ne retient pas la rangée, donc rien n'est réécrit.
    const ligne = LIGNES["rejeu de la même tentative"]
    expect(classerRevendication(ligne, contexte)).toEqual({ kind: "rejoue" })
    expect(retient(clause, ligne)).toBe(false)
  })

  it("est plus étroite que le verdict, et le dit", () => {
    // L'écart est réel et il est aujourd'hui sans conséquence : la classification
    // autorise une écriture sur un Brouillon libéré, la clause la refuse, et le
    // registre retombe alors sur sa relecture, qui rend le même refus qu'aurait
    // rendu l'adaptateur en mémoire. Les deux adaptateurs répondent donc
    // pareil, mais par deux chemins. C'est cet écart que #502 supprime en
    // faisant classifier le registre une fois pour toutes.
    expect(autorise(LIGNES["libéré"])).toBe(true)
    expect(retient(clause, LIGNES["libéré"])).toBe(false)

    // Le même écart sur un Brouillon `vivant` qui garde une tentative : c'est ce
    // qu'une compensation laisse derrière elle quand elle échoue à moitié, et la
    // revendication suivante s'y heurte. La clause le dit déjà en exigeant une
    // tentative nulle — mais l'échelle, elle, l'a laissé passer.
    expect(autorise(LIGNES["vivant, tentative restée"])).toBe(true)
    expect(retient(clause, LIGNES["vivant, tentative restée"])).toBe(false)
  })
})
