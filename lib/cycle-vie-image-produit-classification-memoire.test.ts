import { describe, expect, it } from "vitest"

import {
  clauseComparaisonEchange,
  type BrouillonImageProduit,
} from "@/lib/cycle-vie-image-produit"
import { lire } from "@/lib/use-cases/outils-frontiere"
import {
  creerHorlogeControllable,
  creerRegistreImageProduitMemoire,
  recevable,
} from "@/test/cycle-vie-image-produit-memoire"

const DATE_INITIALE = new Date("2026-06-01T10:00:00.000Z")
const MS_PAR_H = 60 * 60 * 1000
const RETENTION_H = 24
const EXPIRATION = new Date(DATE_INITIALE.getTime() + RETENTION_H * MS_PAR_H)

const DRAFT = "brouillon-1"
const PROPRIETAIRE = "editeur-1"
const AUTRE_PROPRIETAIRE = "editeur-2"
const TENTATIVE = "tentative-1"
const TENTATIVE_RIVALE = "tentative-2"

const ADAPTATEUR = lire(
  import.meta.url,
  "../test/cycle-vie-image-produit-memoire.ts"
)

function creerRegistre() {
  const horloge = creerHorlogeControllable(DATE_INITIALE)
  const registre = creerRegistreImageProduitMemoire(() =>
    horloge.horloge.maintenant()
  )
  return { horloge, registre }
}

async function creerBrouillon(
  registre: ReturnType<typeof creerRegistre>["registre"]
) {
  return await registre.creer({
    id: DRAFT,
    ownerId: PROPRIETAIRE,
    contentType: "image/png",
    byteSize: 1024,
    expiresAt: EXPIRATION,
  })
}

function revendiquer(
  registre: ReturnType<typeof creerRegistre>["registre"],
  tentatives: { tentativeId: string; ownerId?: string; now: Date }
) {
  return registre.revendiquer({
    id: DRAFT,
    ownerId: tentatives.ownerId ?? PROPRIETAIRE,
    tentativeId: tentatives.tentativeId,
    now: tentatives.now,
  })
}

function codeDe(reponse: Awaited<ReturnType<typeof revendiquer>>) {
  return reponse.ok ? null : reponse.code
}

/**
 * L'adaptateur en mémoire, sur la seule voie qui-intereste ici : ce qu'il rend
 * quand la revendication ne se poursuit pas. Le contrat rejoue les mêmes
 * scénarios contre le registre durable — c'est là que se prouve l'accord — et
 * cette suite fixe, pour l'adaptateur seul, les refus qu'il rend et les deux
 * écritures qu'il fait.
 */
describe("revendication refusée — l'adaptateur en mémoire", () => {
  it("refuse un identifiant inconnu", async () => {
    const { registre } = creerRegistre()
    const reponse = await revendiquer(registre, {
      tentativeId: TENTATIVE,
      now: DATE_INITIALE,
    })

    expect(codeDe(reponse)).toBe("introuvable")
  })

  it("refuse un Brouillon qui n'est pas à cet éditeur", async () => {
    const { registre } = creerRegistre()
    await creerBrouillon(registre)
    const reponse = await revendiquer(registre, {
      tentativeId: TENTATIVE,
      ownerId: AUTRE_PROPRIETAIRE,
      now: DATE_INITIALE,
    })

    expect(codeDe(reponse)).toBe("proprietaire-incorrect")
  })

  it("refuse un Brouillon déjà pris par une tentative rivale", async () => {
    const { registre } = creerRegistre()
    await creerBrouillon(registre)
    await revendiquer(registre, { tentativeId: TENTATIVE, now: DATE_INITIALE })
    const reponse = await revendiquer(registre, {
      tentativeId: TENTATIVE_RIVALE,
      now: DATE_INITIALE,
    })

    expect(codeDe(reponse)).toBe("deja-revendique")
  })

  it("refuse un Brouillon libéré, et ne le réveille pas", async () => {
    const { registre } = creerRegistre()
    await creerBrouillon(registre)
    await registre.marquerLibere({ id: DRAFT, ownerId: PROPRIETAIRE })
    const reponse = await revendiquer(registre, {
      tentativeId: TENTATIVE,
      now: DATE_INITIALE,
    })

    expect(codeDe(reponse)).toBe("deja-libere")
    expect(registre.records.get(DRAFT)?.state).toBe("libéré")
  })

  it("refuse un Brouillon dont la rétention est échue, et le résout en `expiré`", async () => {
    const { horloge, registre } = creerRegistre()
    await creerBrouillon(registre)
    horloge.fixer(new Date(EXPIRATION.getTime() + 1))
    const reponse = await revendiquer(registre, {
      tentativeId: TENTATIVE,
      now: horloge.horloge.maintenant(),
    })

    expect(codeDe(reponse)).toBe("expire")
    expect(registre.records.get(DRAFT)?.state).toBe("expiré")
  })

  it("refuse un `expiré` dont la rétention n'est pas encore passée", async () => {
    // Un état que la production ne produit pas, l'horloge ne reculant pas. Il se
    // classe quand même, et l'adaptateur ne doit pas le prendre pour une
    // expiration qu'il n'y a pas.
    const { horloge, registre } = creerRegistre()
    await creerBrouillon(registre)
    horloge.fixer(new Date(EXPIRATION.getTime() + 1))
    await registre.lire(DRAFT)
    horloge.fixer(DATE_INITIALE)
    const reponse = await revendiquer(registre, {
      tentativeId: TENTATIVE,
      now: DATE_INITIALE,
    })

    expect(codeDe(reponse)).toBe("non-vivant")
  })
})

describe("revendication réussie — l'adaptateur en mémoire", () => {
  it("prend un Brouillon vivant par deux écritures, et rien d'autre", async () => {
    const { registre } = creerRegistre()
    await creerBrouillon(registre)
    const reponse = await revendiquer(registre, {
      tentativeId: TENTATIVE,
      now: DATE_INITIALE,
    })

    expect(reponse.ok).toBe(true)
    const rangee = registre.records.get(DRAFT)
    expect(rangee?.state).toBe("revendiqué")
    expect(rangee?.tentativeId).toBe(TENTATIVE)
  })

  it("rejoue la tentative qui a déjà pris, sans réécrire la rangée", async () => {
    const { horloge, registre } = creerRegistre()
    await creerBrouillon(registre)
    await revendiquer(registre, { tentativeId: TENTATIVE, now: DATE_INITIALE })
    horloge.fixer(new Date(EXPIRATION.getTime() + 1))

    const reponse = await revendiquer(registre, {
      tentativeId: TENTATIVE,
      now: horloge.horloge.maintenant(),
    })

    // La rétention limite une *nouvelle* revendication, pas la résolution d'une
    // tentative déjà gagnée : le rejeu aboutit, et il ne réétiquette pas.
    expect(reponse.ok).toBe(true)
    expect(registre.records.get(DRAFT)?.state).toBe("revendiqué")
  })

  it("tranche à la milliseconde de la rétention, et pas une avant", async () => {
    // L'horloge du registre avance en secondes, alors que la frontière est à la
    // milliseconde : c'est l'instant qu'on fixe, pas le pas qu'on compte.
    const { horloge, registre } = creerRegistre()
    await creerBrouillon(registre)
    horloge.fixer(new Date(EXPIRATION.getTime() - 1))
    expect(
      codeDe(
        await revendiquer(registre, {
          tentativeId: TENTATIVE,
          now: horloge.horloge.maintenant(),
        })
      )
    ).toBe(null)

    horloge.fixer(new Date(EXPIRATION.getTime()))
    expect(
      codeDe(
        await revendiquer(registre, {
          tentativeId: TENTATIVE_RIVALE,
          now: horloge.horloge.maintenant(),
        })
      )
    ).toBe("expire")
  })
})

/**
 * L'adaptateur ne doit plus porter la règle. Ces trois lectures disent qu'il ne
 * la porte plus ; elles ne diraient rien s'il la portait encore à côté, mais
 * #500 a montré qu'une règle dupliquée ne se voit pas à l'usage — les deux
 * adaptateurs répondaient pareil pendant que les règles divergeaient déjà.
 */
describe("l'adaptateur ne porte plus la règle", () => {
  function corpsDe(nom: string): string {
    const trouvee = ADAPTATEUR.search(new RegExp(`^\\s*async ${nom}\\(`, "m"))
    if (trouvee < 0) throw new Error(`${nom} doit exister dans l'adaptateur`)
    // La recherche part de la ligne suivante : lancées sur la première ligne,
    // `^` y trouve la déclaration qu'on est en train de lire, et la coupe rend
    // la chaîne vide — une garde qui passe toujours n'est pas une garde.
    const suite = ADAPTATEUR.slice(ADAPTATEUR.lastIndexOf("\n", trouvee) + 1)
    const finDeLigne = suite.indexOf("\n")
    const suiteApres = suite.slice(finDeLigne + 1)
    const methodeSuivante = suiteApres.search(/^\s{4}async \w+\(/m)
    return methodeSuivante < 0
      ? suite
      : suite.slice(0, finDeLigne + 1 + methodeSuivante)
  }

  it("revendiquer appelle la classification partagée et n'écrit que deux champs", () => {
    const corps = corpsDe("revendiquer")
    expect(corps).toContain("classerRevendication(")
    expect(corps).toContain("reLabellableExpire(")
    expect(corps).toContain("verdict.refusalSiEchec")
    // Ni échelle de barreaux, ni ternaire du refus non-vivant.
    expect(corps).not.toMatch(/\?\s*"(deja-revendique|deja-libere|non-vivant)"/)
  })

  it("lire et marquerLibere demandent la règle de réétiquetage", () => {
    // Ni l'une ni l'autre n'a de revendication à passer : la règle de
    // réétiquetage se pose à la rangée seule, jamais à une revendication
    // fabriquée pour emprunter son verdict.
    for (const nom of ["lire", "marquerLibere"]) {
      expect(corpsDe(nom), nom).toContain("reLabellableExpire(")
      expect(corpsDe(nom), nom).not.toContain("classerRevendication(")
    }
  })

  it("le prédicat d'expiration du propre de l'adaptateur a disparu", () => {
    expect(ADAPTATEUR).not.toContain("resolubleEnExpire")
  })
})

/**
 * **`recevable` est la transcription de la clause de comparaison-and-échange.**
 * Le fait était écrit deux fois avant que cette piste commence : l'adaptateur en
 * mémoire l'avait sous forme de dernier barreau, et la base l'a toujours eu
 * dans son `where`. #499 a nommé le premier ; cette suite le tient au même
 * standard que #500 tient la seconde.
 *
 * La comparaison se fait sur la clause, pas sur un résumé : chaque condition de
 * `recevable` se retrouve dans la clause, et chaque condition de la clause se
 * retrouve dans `recevable`. Une clause qui perdrait une condition — ou qui en
 * gagnerait une — ferait échouer la suite, des deux côtés.
 *
 * Ce que la comparaison **ne** dit pas, et qu'aucune suite ne peut dire : que la
 * clause soit atomique. `recevable` répond « une écriture prendrait-elle ? »,
 * sans jamais voir l'écrivain concurrent qu'elle ne voit pas. C'est
 * précisément pourquoi elle n'est pas dans la classification.
 */
describe("recevable est la transcription de la clause de comparaison-and-échange", () => {
  const clause = clauseComparaisonEchange({
    id: DRAFT,
    ownerId: PROPRIETAIRE,
    now: DATE_INITIALE,
  })

  /** Un Brouillon aussi neutre que possible : seuls l'état et la tentative varient. */
  function brouillon(
    etat: BrouillonImageProduit["state"],
    tentative: string | null
  ): BrouillonImageProduit {
    return {
      id: DRAFT,
      mimeType: "image/png",
      byteSize: 1024,
      ownerId: PROPRIETAIRE,
      tentativeId: tentative,
      createdAt: DATE_INITIALE,
      expiresAt: EXPIRATION,
      state: etat,
      promotedPublicUrl: null,
      productId: null,
    }
  }

  const CAS: readonly (readonly [
    BrouillonImageProduit["state"],
    string | null,
    boolean,
  ])[] = [
    ["vivant", null, true],
    ["vivant", TENTATIVE, false],
    ["revendiqué", TENTATIVE, false],
    ["revendiqué", null, false],
    ["libéré", null, false],
    ["expiré", null, false],
  ]

  it("retient exactement ce que la clause retient", () => {
    for (const [etat, tentative, attendue] of CAS) {
      const rangee = brouillon(etat, tentative)
      // La clause dit `state: "vivant"` et `tentativeId: null` ; on lit ses
      // conditions telles qu'elle les écrit, sans les réécrire ici.
      const parLaClause =
        rangee.state === clause.state &&
        rangee.tentativeId === clause.tentativeId
      const parLaFonction = recevable(rangee)

      const cas = `${etat}/${String(tentative)}`
      expect(parLaFonction, cas).toBe(attendue)
      expect(parLaFonction, cas).toBe(parLaClause)
    }
  })

  it("ne fatigue pas à écrire des conditions que la clause n'a pas", () => {
    // Les six états du domaine, et pas un de plus : un état que le registre ne
    // connaît pas n'est pas une rangée, c'est une colonne mal lue. Sa règle est
    // dans la suite de la classification, où elle se classe.
    // La preuve que la comparaison ci-dessus n'est pas tautologique : les
    // conditions que la clause écrit sont exactement celles que `recevable`
    // regarde, et il n'y en a pas une de plus.
    const conditions = Object.entries(clause).filter(
      ([champ]) => champ !== "id"
    )
    expect(conditions.map(([champ]) => champ).sort()).toEqual([
      "expiresAt",
      "ownerId",
      "state",
      "tentativeId",
    ])
    // `ownerId` et `expiresAt` sont des conditions de la *demande*, pas de la
    // rangée : la classification les a déjà tranchées avant l'écriture. Les
    // deux autres sont les seules que la rangée doit porter.
    expect(recevable(brouillon("vivant", null))).toBe(true)
  })
})
