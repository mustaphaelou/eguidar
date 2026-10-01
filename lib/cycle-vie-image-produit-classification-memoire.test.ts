import { describe, expect, it } from "vitest"

import { lire } from "@/lib/use-cases/outils-frontiere"
import {
  creerHorlogeControllable,
  creerRegistreImageProduitMemoire,
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
