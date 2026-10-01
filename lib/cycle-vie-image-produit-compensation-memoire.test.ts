import { describe, expect, it } from "vitest"

import type { BrouillonImageProduit } from "@/lib/cycle-vie-image-produit"
import { lire } from "@/lib/use-cases/outils-frontiere"
import {
  creerHorlogeControllable,
  creerRegistreImageProduitMemoire,
  type RegistreImageProduitMemoire,
} from "@/test/cycle-vie-image-produit-memoire"

const DATE_INITIALE = new Date("2026-06-01T10:00:00.000Z")
const MS_PAR_H = 60 * 60 * 1000
const RETENTION_H = 24
const EXPIRATION = new Date(DATE_INITIALE.getTime() + RETENTION_H * MS_PAR_H)

const DRAFT = "brouillon-1"
const TENTATIVE = "tentative-1"
const PRODUIT = "produit-1"
const URL_PROMUE = "memoire://image/brouillon-1"

function creerRegistre() {
  const horloge = creerHorlogeControllable(DATE_INITIALE)
  const registre = creerRegistreImageProduitMemoire(() =>
    horloge.horloge.maintenant()
  )
  return { horloge, registre }
}

/**
 * Un Brouillon d'Image produit pris par la tentative, tel qu'il est au moment
 * où la compensation arrive : la revendication a réussi, l'enregistrement du
 * Catalogue a échoué.
 */
async function prendre(registre: RegistreImageProduitMemoire) {
  await registre.creer({
    id: DRAFT,
    ownerId: "editeur-1",
    contentType: "image/png",
    byteSize: 1024,
    expiresAt: EXPIRATION,
  })
  const revendication = await registre.revendiquer({
    id: DRAFT,
    ownerId: "editeur-1",
    tentativeId: TENTATIVE,
    now: DATE_INITIALE,
  })
  if (!revendication.ok) throw new Error("La revendication devait réussir")
  return revendication.value
}

/**
 * Un état que les opérations du port ne produisent pas — un Brouillon libéré
 * qui porterait encore sa tentative, un Brouillon rendu `vivant` qui la
 * conserverait — et que la règle doit pourtant classer. La rangée du registre
 * en mémoire est exposée aux suites : l'y écrire est la seule façon de rejouer
 * ces deux barreaux sans inventer une opération qui les produirait.
 */
function ecrireEtat(
  registre: RegistreImageProduitMemoire,
  faits: Partial<BrouillonImageProduit>
): void {
  const brouillon = registre.records.get(DRAFT)
  if (!brouillon) throw new Error("Le Brouillon doit exister")
  Object.assign(brouillon, faits)
}

function etat(registre: RegistreImageProduitMemoire) {
  const { state, tentativeId, productId, promotedPublicUrl } =
    registre.records.get(DRAFT) ?? {}
  return { state, tentativeId, productId, promotedPublicUrl }
}

async function compenser(registre: RegistreImageProduitMemoire) {
  await registre.annulerRevendication({ id: DRAFT, tentativeId: TENTATIVE })
}

describe("compensation d'une revendication échouée — adaptateur en mémoire", () => {
  it("rend à l'éditeur le Brouillon que la tentative venait de prendre", async () => {
    const { registre } = creerRegistre()
    await prendre(registre)

    await compenser(registre)

    expect(etat(registre)).toEqual({
      state: "vivant",
      tentativeId: null,
      productId: null,
      promotedPublicUrl: null,
    })
  })

  it("ne rend pas un Brouillon déjà vivant", async () => {
    const { registre } = creerRegistre()
    await prendre(registre)
    // Une compensation rejouée : le Brouillon a déjà été rendu une fois, et la
    // tentative effacée avec. C'est bien l'état qui l'en empêche, et non le
    // seul portrait de la ligne.
    ecrireEtat(registre, { state: "vivant", tentativeId: null })
    const avant = etat(registre)

    await compenser(registre)

    expect(etat(registre)).toEqual(avant)
  })

  it("ne rend pas un Brouillon libéré", async () => {
    const { registre } = creerRegistre()
    await prendre(registre)
    ecrireEtat(registre, { state: "libéré" })

    await compenser(registre)

    // La libération est terminale : l'éditeur a été prévenu et l'objet
    // supprimé, un rendu le remettrait en jeu.
    expect(etat(registre)).toMatchObject({
      state: "libéré",
      tentativeId: TENTATIVE,
    })
  })

  it("ne défait pas un Brouillon déjà lié à un Produit", async () => {
    const { registre } = creerRegistre()
    await prendre(registre)
    const confirmation = await registre.confirmerPromotion({
      id: DRAFT,
      tentativeId: TENTATIVE,
      productId: PRODUIT,
      publicUrl: URL_PROMUE,
    })
    if (!confirmation) throw new Error("La confirmation devait réussir")

    await compenser(registre)

    // C'est une Image produit persistée : sa suppression n'intervient qu'après
    // un enregistrement réussi, jamais par une compensation.
    expect(etat(registre)).toMatchObject({
      state: "revendiqué",
      productId: PRODUIT,
      promotedPublicUrl: URL_PROMUE,
    })
  })

  it("ne ressuscite pas un Brouillon expiré", async () => {
    const { horloge, registre } = creerRegistre()
    await prendre(registre)
    horloge.avancer(RETENTION_H * MS_PAR_H + 1)
    // La lecture est ce qui résout l'expiration ; la compensation la rejoue.
    await registre.lire(DRAFT)

    await compenser(registre)

    expect(etat(registre)).toMatchObject({
      state: "expiré",
      tentativeId: TENTATIVE,
    })
  })

  it("ne lève pas quand il n'y a rien à compenser", async () => {
    const { registre } = creerRegistre()

    // Une compensation qui ne trouve pas son Brouillon n'est pas un échec :
    // le port rend `void`, et l'appelant — un chemin d'erreur du Catalogue —
    // n'a donc rien à rattraper.
    await expect(
      registre.annulerRevendication({
        id: "brouillon-inconnu",
        tentativeId: TENTATIVE,
      })
    ).resolves.toBeUndefined()
  })
})

/**
 * La règle de compensation a une seule implémentation : celle du module
 * propriétaire. L'adaptateur en mémoire l'appelle ; il ne la réécrit pas. Une
 * garde le prouve sur la source, parce qu'aucun test de comportement ne le
 * peut — les deux copies répondent aujourd'hui pareil, et c'est précisément ce
 * qui les laisserait diverger à nouveau en silence.
 */
const ADAPTATEUR = lire(
  import.meta.url,
  "../test/cycle-vie-image-produit-memoire.ts"
)

/** Le corps d'une opération de l'adaptateur en mémoire, lu dans sa source. */
function corpsDe(nom: string): string {
  const debut = ADAPTATEUR.indexOf(`async ${nom}(`)
  if (debut < 0) throw new Error(`L'opération ${nom} doit exister`)
  const fin = ADAPTATEUR.indexOf("\n    async ", debut)
  return ADAPTATEUR.slice(debut, fin < 0 ? undefined : fin)
}

describe("compensation d'une revendication échouée — une seule règle", () => {
  it("fait écrire l'adaptateur en mémoire par la règle du module propriétaire", () => {
    expect(ADAPTATEUR).toMatch(
      /import \{[^}]*\bcompensationAdmise\b[^}]*\} from "@\/lib\/cycle-vie-image-produit"/
    )
    expect(corpsDe("annulerRevendication")).toContain("compensationAdmise(")
  })

  it("ne laisse plus de copie propre de la règle dans l'adaptateur en mémoire", () => {
    // Le corps de la compensation ne cite plus aucun état : la règle vit dans
    // le module, et l'adaptateur n'a plus que la forme de son stockage.
    expect(corpsDe("annulerRevendication")).not.toContain("revendiqué")
  })
})
