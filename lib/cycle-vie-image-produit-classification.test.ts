import { describe, expect, it } from "vitest"

import {
  classerRevendication,
  reLabellableExpire,
} from "@/lib/cycle-vie-image-produit"
import { lire } from "@/lib/use-cases/outils-frontiere"

const PROPRIETAIRE = "editeur-1"
const AUTRE_PROPRIETAIRE = "editeur-2"
const TENTATIVE = "tentative-1"
const TENTATIVE_RIVALE = "tentative-2"
const PRODUIT = "produit-1"
const DEBUT = new Date("2026-07-01T10:00:00.000Z")
const MS_PAR_H = 60 * 60 * 1000
const RETENTION_H = 24
const EXPIRATION = new Date(DEBUT.getTime() + RETENTION_H * MS_PAR_H)

/**
 * Les cinq faits dont se décide une revendication. La suite les écrit elle-même
 * plutôt que d'importer un type du module propriétaire : c'est l'interface que
 * la fonction attend, et `tsc` la revérifie à chaque compilation des deux côtés.
 * `state` y est large, comme la colonne que le registre durable lit sans la
 * valider.
 */
type Ligne = {
  state: string
  ownerId: string
  tentativeId: string | null
  expiresAt: Date
  productId: string | null
}

function brouillon(faits: Partial<Ligne> = {}): Ligne {
  return {
    state: "vivant",
    ownerId: PROPRIETAIRE,
    tentativeId: null,
    expiresAt: EXPIRATION,
    productId: null,
    ...faits,
  }
}

function classer(
  ligne: Ligne | null,
  faits: Partial<{ ownerId: string; tentativeId: string; now: Date }> = {}
) {
  return classerRevendication(ligne, {
    ownerId: PROPRIETAIRE,
    tentativeId: TENTATIVE,
    now: DEBUT,
    ...faits,
  })
}

describe("classification d'une revendication — identifiant inconnu", () => {
  it("tranche sur l'absence", () => {
    expect(classer(null)).toEqual({ kind: "tranche", code: "introuvable" })
  })
})

describe("classification d'une revendication — propriétaire", () => {
  it("tranche sur un Brouillon qui n'est pas à cet éditeur", () => {
    expect(classer(brouillon({ ownerId: AUTRE_PROPRIETAIRE }))).toEqual({
      kind: "tranche",
      code: "proprietaire-incorrect",
    })
  })

  it("tranche sur le mauvais propriétaire avant de regarder la rétention", () => {
    // Le propriétaire passe avant la rétention : un Brouillon d'un autre éditeur
    // dont la rétention est échue n'est pas concerné par cette revendication, et
    // le registre le résoudra à sa prochaine lecture, à l'appel du sien.
    expect(
      classer(brouillon({ ownerId: AUTRE_PROPRIETAIRE, expiresAt: DEBUT }), {
        now: DEBUT,
      })
    ).toEqual({ kind: "tranche", code: "proprietaire-incorrect" })
  })
})

describe("classification d'une revendication — la même tentative", () => {
  it("reconnaît la tentative qui a déjà pris le Brouillon", () => {
    expect(
      classer(brouillon({ state: "revendiqué", tentativeId: TENTATIVE }))
    ).toEqual({ kind: "rejoue" })
  })

  it("rejoue avant de regarder la rétention, et sans réétiqueter", () => {
    // C'est l'ordre qui rend le rejeu idempotent : la rétention limite une
    // *nouvelle* revendication, pas la résolution d'une tentative déjà gagnée.
    const verdict = classer(
      brouillon({
        state: "revendiqué",
        tentativeId: TENTATIVE,
        expiresAt: DEBUT,
      })
    )

    // Le réétiquetage ne se décide que sur un bras `tranche`, et celui-ci n'en
    // est pas un : rien à demander à personne, et le verdict ne le dit pas.
    expect(verdict).toEqual({ kind: "rejoue" })
    expect(verdict).not.toMatchObject({ code: "expire" })
  })

  it("rejoue un Brouillon déjà lié à un Produit, qui n'appartient qu'à lui", () => {
    expect(
      classer(
        brouillon({
          state: "revendiqué",
          tentativeId: TENTATIVE,
          productId: PRODUIT,
        })
      )
    ).toEqual({ kind: "rejoue" })
  })

  it("ne rejoue pas au nom d'une tentative rivale", () => {
    expect(
      classer(brouillon({ state: "revendiqué", tentativeId: TENTATIVE_RIVALE }))
    ).toEqual({ kind: "a_ecrire", refusalSiEchec: "deja-revendique" })
  })
})

describe("classification d'une revendication — la rétention", () => {
  it("laisse passer à la milliseconde avant l'expiration", () => {
    expect(
      classer(brouillon(), { now: new Date(EXPIRATION.getTime() - 1) })
    ).toEqual({ kind: "a_ecrire", refusalSiEchec: "non-vivant" })
  })

  it("tranche à l'instant exact de la rétention", () => {
    expect(classer(brouillon(), { now: EXPIRATION })).toEqual({
      kind: "tranche",
      code: "expire",
    })
  })

  it("tranche au-delà de la rétention", () => {
    expect(
      classer(brouillon(), { now: new Date(EXPIRATION.getTime() + 1) })
    ).toEqual({ kind: "tranche", code: "expire" })
  })

  it("tranche au-delà sur un Brouillon revendiqué par une autre tentative", () => {
    // Une revendication échouée laisse un Brouillon `revendiqué` sans Produit :
    // sa rétention échue doit le résoudre en `expiré` lui aussi (histoire 25 de
    // l'issue #406), sinon il refuse toute tentative sans jamais le dire.
    expect(
      classer(
        brouillon({ state: "revendiqué", tentativeId: TENTATIVE_RIVALE }),
        { now: new Date(EXPIRATION.getTime() + 1) }
      )
    ).toEqual({ kind: "tranche", code: "expire" })
  })

  it("tranche au-delà sur un Brouillon déjà lié à un Produit, sans le réétiqueter", () => {
    // La rétention est échue, donc la revendication se refuse — mais la rangée
    // est une Image produit persistée : ce n'est pas à cette revendication de la
    // réétiqueter. Le refus tranche, le réétiquetage est une autre question.
    expect(
      classer(brouillon({ productId: PRODUIT, expiresAt: DEBUT }))
    ).toEqual({ kind: "tranche", code: "expire" })
  })

  it("tranche au-delà sur un Brouillon libéré, sans le réétiqueter", () => {
    expect(
      classer(
        brouillon({ state: "libéré", tentativeId: TENTATIVE, expiresAt: DEBUT })
      )
    ).toEqual({ kind: "tranche", code: "expire" })
  })
})

describe("classification d'une revendication — un état ni vivant ni rétention dépassée", () => {
  it("laisse écrire un Brouillon vivant, et nomme le refus si l'écriture échoue", () => {
    expect(classer(brouillon())).toEqual({
      kind: "a_ecrire",
      refusalSiEchec: "non-vivant",
    })
  })

  it("nomme le refus d'un Brouillon libéré si l'écriture échoue", () => {
    expect(
      classer(brouillon({ state: "libéré", tentativeId: TENTATIVE }))
    ).toEqual({ kind: "a_ecrire", refusalSiEchec: "deja-libere" })
  })

  it("nomme le refus d'un Brouillon déjà expiré dont la rétention n'est pas passée", () => {
    // Un état `expiré` avant l'échéance ne se produit pas en production, l'horloge
    // ne recule pas. Il doit se classer quand même, et comme un simple refus de
    // non-vivant : ni comme une expiration à réétiqueter, ni comme un rejeu.
    expect(classer(brouillon({ state: "expiré" }))).toEqual({
      kind: "a_ecrire",
      refusalSiEchec: "non-vivant",
    })
  })

  it("classe un état que le registre ne connaît pas comme un Brouillon non vivant", () => {
    expect(
      classer(brouillon({ state: "état-inconnu", tentativeId: TENTATIVE }))
    ).toEqual({ kind: "a_ecrire", refusalSiEchec: "non-vivant" })
  })

  it("nomme le refus d'un Brouillon déjà pris quand l'écriture perd la course", () => {
    // C'est le refus que rend l'adaptateur quand la comparaison-and-échange
    // n'a rien écrit : la ligne a bougé, et c'est son état qui le dit.
    expect(
      classer(
        brouillon({
          state: "revendiqué",
          tentativeId: TENTATIVE,
          productId: PRODUIT,
        }),
        { tentativeId: TENTATIVE_RIVALE }
      )
    ).toEqual({ kind: "a_ecrire", refusalSiEchec: "deja-revendique" })
  })
})

/**
 * Aucun message ne traverse la classification. Les deux adaptateurs n'écrivent
 * pas la même prose pour un même refus — le registre durable dit « Brouillon
 * expiré », l'adaptateur en mémoire « Ce brouillon a expiré » — et cette
 * divergence n'a jamais atteint l'éditeur : le module propriétaire remplace
 * déjà le sien pour les codes où les deux différaient, et ne laisse passer que
 * ceux où les deux se tassent. Un message qui traverserait la classification
 * rattacherait une fois de plus le texte d'un adaptateur à une règle qui n'a
 * rien à dire d'un texte.
 */
const MODULE = lire(import.meta.url, "./cycle-vie-image-produit.ts")

/**
 * Une déclaration du module, de sa ligne d'ouverture à la prochaine ligne de
 * colonne zéro. Le module n'a que des déclarations de premier niveau : c'est
 * cette frontière qui borne la lecture, et une coupe au premier caractère non
 * blanc Phoque la declaration à zéro caractère — une garde qui passe toujours
 * n'est pas une garde.
 */
function declarationDe(nom: string): string {
  const trouvee = MODULE.search(
    new RegExp(`^(?:export )?(?:function|type|const|interface) ${nom}\\b`, "m")
  )
  if (trouvee < 0) throw new Error(`La déclaration ${nom} doit exister`)
  const suite = MODULE.slice(MODULE.lastIndexOf("\n", trouvee) + 1)
  const finDeLigne = suite.indexOf("\n")
  const suiteApres = suite.slice(finDeLigne + 1)
  const prochaineColonneZero = suiteApres.search(/^[^\s]/m)
  return prochaineColonneZero < 0
    ? suite
    : suite.slice(0, finDeLigne + 1 + prochaineColonneZero)
}

/**
 * Le module propriétaire ne doit plus porter d'échelle à lui. Ces lectures
 * disent qu'il ne la porte plus ; elles ne prouveraient rien s'il la portait
 * encore à côté — et c'est exactement ce qui est arrivé : deux règles
 * identiques, une divergence, et un commit pour la réparer.
 */
describe("le registre durable ne porte plus sa propre échelle", () => {
  it("n'a plus de fonction de classification qui lui soit propre", () => {
    for (const nom of [
      "classer",
      "estResolubleEnExpire",
      "resolubleEnExpire",
      "refusNonVivant",
    ]) {
      const declaree = new RegExp(`(?:function|const) ${nom}\\b`, "m").test(
        MODULE
      )
      expect(declaree, nom).toBe(false)
    }
    expect(MODULE).not.toContain("VerdictRegistre")
  })

  it("classifie deux fois autour de la comparaison-and-échange", () => {
    // Avant d'écrire, pour savoir si l'on écrit ; après, pour savoir qui a
    // gagné. Les deux appels sont la double lecture, et ils sont la même
    // fonction : ce que le commentaire d'ici exigeait d'eux est devenu le
    // fait qu'ils ne peuvent pas être deux.
    const revendiquer = corpsDeLaMethode("revendiquer")
    const [, entre, apres] = revendiquer.split("classerRevendication(")
    expect(revendiquer.match(/classerRevendication\(/g)).toHaveLength(2)
    // Entre les deux, la seule écriture : sous la clause, qui décide sous
    // verrou. Après la seconde, plus rien qui décide — le refus se lit dans le
    // verdict relu, jamais dans un état relu de nouveau. C'est pourquoi les
    // deux bras du verdict sont nommés là : les écrire à la main les
    // remplacerait par un appel à `refusRegistre`, qui passerait quand même.
    expect(entre).toContain("clauseComparaisonEchange(")
    expect(apres).toContain("refusRegistre(")
    expect(apres).toContain("apres.code")
    expect(apres).toContain("apres.refusalSiEchec")
  })
})

/**
 * Une méthode du registre durable, de son ouverture à la suivante. Comme pour
 * `declarationDe`, la recherche part de la ligne d'après : lancée sur la
 * première ligne, `^` y retrouve la déclaration qu'on est en train de lire.
 */
function corpsDeLaMethode(nom: string): string {
  const trouvee = MODULE.search(new RegExp(`^\\s+async ${nom}\\(`, "m"))
  if (trouvee < 0) throw new Error(`La méthode ${nom} doit exister`)
  const suite = MODULE.slice(MODULE.lastIndexOf("\n", trouvee) + 1)
  const finDeLigne = suite.indexOf("\n")
  const suiteApres = suite.slice(finDeLigne + 1)
  const suivante = suiteApres.search(/^\s+(async )?\w+\(/m)
  return suivante < 0 ? suite : suite.slice(0, finDeLigne + 1 + suivante)
}

describe("classification d'une revendication — aucun message", () => {
  it("ne rend que des codes, jamais une prose d'adaptateur", () => {
    for (const nom of [
      "classerRevendication",
      "VerdictRevendication",
      "reLabellableExpire",
    ]) {
      const declaration = declarationDe(nom)
      expect(declaration, nom).not.toContain("message")
      expect(declaration, nom).not.toContain("ResultatRevendicationRegistre")
    }
  })
})

/**
 * **La règle du réétiquetage, seule.** Elle ne répond pas à la même question
 * que la classification — « cette rangée peut-elle être réétiquetée `expiré` ? »,
 * et non « cette revendication peut-elle se poursuivre ? » — et elle ne se laisse
 * pas emprunter à un verdict de revendication : une lecture du registre, une
 * libération refusée n'ont pas de tentative à passer, et en fabriquer une ne
 * fonctionnerait que tant qu'aucune rangée ne porte une tentative vide. Un fait
 * invérifié ne peut pas porter une règle.
 *
 * Elle ne regarde pas l'horloge non plus, et c'est délibéré : elle dit ce qu'une
 * rangée *peut* devenir, pas si sa rétention est échouée. L'instant appartient à
 * celui qui sait de quelle rétention il parle.
 */
describe("réétiquetage d'un Brouillon d'Image produit en `expiré`", () => {
  it("réétiquette un Brouillon vivant", () => {
    expect(reLabellableExpire(brouillon())).toBe(true)
  })

  it("réétiquette un Brouillon revendiqué, qui ne l'est plus de personne", () => {
    // Une compensation best-effort laisse ce Brouillon sans Produit et avec une
    // tentative : il refuse toute autre tentative à juste titre, mais resterait
    // invisible comme expiré alors que sa rétention est écoulée (histoire 25 de
    // l'issue #406).
    expect(
      reLabellableExpire(
        brouillon({ state: "revendiqué", tentativeId: TENTATIVE })
      )
    ).toBe(true)
  })

  it("ne réétiquette pas un Brouillon déjà lié à un Produit", () => {
    // C'est une Image produit persistée : elle appartient au Catalogue, et le
    // registre n'a plus rien à dire de son état de cycle de vie.
    expect(reLabellableExpire(brouillon({ productId: PRODUIT }))).toBe(false)
  })

  it("ne réétiquette pas un Brouillon libéré", () => {
    // La libération est terminale : l'éditeur a été prévenu et l'objet supprimé.
    expect(
      reLabellableExpire(brouillon({ state: "libéré", tentativeId: TENTATIVE }))
    ).toBe(false)
  })

  it("ne réétiquette pas un Brouillon déjà expiré", () => {
    expect(
      reLabellableExpire(brouillon({ state: "expiré", tentativeId: TENTATIVE }))
    ).toBe(false)
  })

  it("ne réétiquette pas un état que le registre ne connaît pas", () => {
    // L'expiration est un état que l'application écrit ; une valeur inattendue
    // n'est pas un état qu'elle sait réétiqueter. La colonne `state` n'est pas une
    // énumération, et cette rangée-là n'appartient à personne.
    expect(
      reLabellableExpire(
        brouillon({ state: "état-inconnu", tentativeId: TENTATIVE })
      )
    ).toBe(false)
  })

  it("ne réétiquette rien quand il n'y a pas de rangée", () => {
    expect(reLabellableExpire(null)).toBe(false)
  })

  it("ignore l'instant : il dit ce qu'une rangée peut devenir, pas si sa rétention est échouée", () => {
    // La rétention n'est pas échue ici, et la règle répond quand même : la
    // décision de réétiqueter appartient à l'appelant, qui, lui, a l'horloge.
    const ligne = brouillon()
    expect(ligne.expiresAt.getTime()).toBeGreaterThan(DEBUT.getTime())
    expect(reLabellableExpire(ligne)).toBe(true)
  })
})
