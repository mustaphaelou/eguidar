import { randomUUID } from "node:crypto"

import { expect } from "vitest"

import type {
  BrouillonImageProduit,
  CodeRefusRegistreBrouillon,
  PortRegistreBrouillonImageProduit,
} from "@/lib/cycle-vie-image-produit"
import {
  creerHorlogeControllable,
  type HorlogeControllable,
} from "@/test/cycle-vie-image-produit-memoire"

const DATE_INITIALE = new Date("2026-05-01T10:00:00.000Z")
const RETENTION_H = 24
const MS_PAR_H = 60 * 60 * 1000
const TENTATIVE = "tentative-1"
const TENTATIVE_RIVALE = "tentative-2"

const expiration = () =>
  new Date(DATE_INITIALE.getTime() + RETENTION_H * MS_PAR_H)

const APRES_RETENTION = RETENTION_H * MS_PAR_H + 1

export type EtatObserve = {
  state: string
  tentativeId: string | null
  promotedPublicUrl: string | null
  productId: string | null
  expiresAt: string
}

function projetEtat(
  brouillon: BrouillonImageProduit | null
): EtatObserve | null {
  if (!brouillon) return null
  return {
    state: brouillon.state,
    tentativeId: brouillon.tentativeId,
    promotedPublicUrl: brouillon.promotedPublicUrl,
    productId: brouillon.productId,
    expiresAt: brouillon.expiresAt.toISOString(),
  }
}

function projetReponse(reponse: unknown): unknown {
  if (reponse === null || typeof reponse !== "object") return reponse
  const objet = reponse as Record<string, unknown>
  if (!("ok" in objet)) return projetEtat(reponse as BrouillonImageProduit)
  if (objet.ok === true) {
    return { ok: true, value: projetEtat(objet.value as BrouillonImageProduit) }
  }
  return { ok: false, code: objet.code }
}

export type AdaptateurRegistre = (
  horloge: HorlogeControllable["horloge"]
) => PortRegistreBrouillonImageProduit

export interface IdentiteRegistre {
  readonly proprietaire: string
  readonly autreProprietaire: string
  readonly produits: readonly [string, string]
}

export interface ContexteScenario extends IdentiteRegistre {
  readonly draftId: string
  readonly horloge: HorlogeControllable
}

export interface ScenarioRegistre {
  readonly nom: string
  jouer(
    registre: PortRegistreBrouillonImageProduit,
    contexte: ContexteScenario
  ): Promise<unknown>
}

function creerBrouillon(
  registre: PortRegistreBrouillonImageProduit,
  contexte: ContexteScenario,
  draftId = contexte.draftId
): Promise<BrouillonImageProduit> {
  return registre.creer({
    id: draftId,
    ownerId: contexte.proprietaire,
    contentType: "image/png",
    byteSize: 1024,
    expiresAt: expiration(),
  })
}

function revendiquer(
  registre: PortRegistreBrouillonImageProduit,
  contexte: ContexteScenario,
  tentativeId: string,
  ownerId = contexte.proprietaire,
  draftId = contexte.draftId
) {
  return registre.revendiquer({
    id: draftId,
    ownerId,
    tentativeId,
    now: contexte.horloge.horloge.maintenant(),
  })
}

async function observe(
  reponse: unknown,
  registre: PortRegistreBrouillonImageProduit,
  contexte: ContexteScenario
) {
  return {
    reponse: projetReponse(reponse),
    etat: projetEtat(await registre.lire(contexte.draftId)),
  }
}

export const SCENARIOS_REGISTRE: readonly ScenarioRegistre[] = [
  {
    nom: "créer puis relire un Brouillon vivant",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      return await observe(
        await registre.lire(contexte.draftId),
        registre,
        contexte
      )
    },
  },
  {
    nom: "relire un identifiant inconnu",
    async jouer(registre, contexte) {
      return {
        lu: projetEtat(await registre.lire("brouillon-inconnu")),
        revendique: projetReponse(
          await revendiquer(
            registre,
            contexte,
            TENTATIVE,
            contexte.proprietaire,
            "brouillon-inconnu"
          )
        ),
        libere: await registre.marquerLibere({
          id: "brouillon-inconnu",
          ownerId: contexte.proprietaire,
        }),
      }
    },
  },
  {
    nom: "revendiquer un Brouillon vivant",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      return await observe(
        await revendiquer(registre, contexte, TENTATIVE),
        registre,
        contexte
      )
    },
  },
  {
    nom: "rejouer la revendication de la même tentative",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      await revendiquer(registre, contexte, TENTATIVE)
      return await observe(
        await revendiquer(registre, contexte, TENTATIVE),
        registre,
        contexte
      )
    },
  },
  {
    nom: "refuser la revendication d'une tentative rivale",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      await revendiquer(registre, contexte, TENTATIVE)
      return await observe(
        await revendiquer(registre, contexte, TENTATIVE_RIVALE),
        registre,
        contexte
      )
    },
  },
  {
    nom: "refuser la revendication d'un autre propriétaire",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      return await observe(
        await revendiquer(
          registre,
          contexte,
          TENTATIVE,
          contexte.autreProprietaire
        ),
        registre,
        contexte
      )
    },
  },
  {
    nom: "refuser la revendication d'un identifiant inconnu",
    async jouer(registre, contexte) {
      return await observe(
        await revendiquer(registre, contexte, TENTATIVE),
        registre,
        contexte
      )
    },
  },
  {
    nom: "revendiquer à la dernière milliseconde, refuser à l'instant exact de la rétention",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      contexte.horloge.fixer(new Date(expiration().getTime() - 1))
      const avant = await revendiquer(registre, contexte, TENTATIVE)
      contexte.horloge.fixer(expiration())
      const aLaFrontiere = await revendiquer(
        registre,
        contexte,
        TENTATIVE_RIVALE
      )
      contexte.horloge.avancer(1)
      const apres = await revendiquer(registre, contexte, TENTATIVE_RIVALE)
      return {
        avant: projetReponse(avant),
        aLaFrontiere: projetReponse(aLaFrontiere),
        apres: projetReponse(apres),
        etat: projetEtat(await registre.lire(contexte.draftId)),
      }
    },
  },
  {
    nom: "refuser la revendication d'un Brouillon libéré",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      await registre.marquerLibere({
        id: contexte.draftId,
        ownerId: contexte.proprietaire,
      })
      return await observe(
        await revendiquer(registre, contexte, TENTATIVE),
        registre,
        contexte
      )
    },
  },
  {
    nom: "libérer un Brouillon vivant",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      return await observe(
        await registre.marquerLibere({
          id: contexte.draftId,
          ownerId: contexte.proprietaire,
        }),
        registre,
        contexte
      )
    },
  },
  {
    nom: "refuser de libérer un Brouillon dont la rétention est dépassée",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      contexte.horloge.avancer(APRES_RETENTION)
      return await observe(
        await registre.marquerLibere({
          id: contexte.draftId,
          ownerId: contexte.proprietaire,
        }),
        registre,
        contexte
      )
    },
  },
  {
    nom: "refuser une seconde libération",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      await registre.marquerLibere({
        id: contexte.draftId,
        ownerId: contexte.proprietaire,
      })
      return await observe(
        await registre.marquerLibere({
          id: contexte.draftId,
          ownerId: contexte.proprietaire,
        }),
        registre,
        contexte
      )
    },
  },
  {
    nom: "refuser la libération par un autre propriétaire",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      return await observe(
        await registre.marquerLibere({
          id: contexte.draftId,
          ownerId: contexte.autreProprietaire,
        }),
        registre,
        contexte
      )
    },
  },
  {
    nom: "compenser une revendication rend le Brouillon à l'éditeur",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      await revendiquer(registre, contexte, TENTATIVE)
      await registre.annulerRevendication({
        id: contexte.draftId,
        tentativeId: TENTATIVE,
      })
      return await observe(
        await revendiquer(registre, contexte, TENTATIVE_RIVALE),
        registre,
        contexte
      )
    },
  },
  {
    nom: "ne pas rendre à l'éditeur un Brouillon expiré",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      await revendiquer(registre, contexte, TENTATIVE)
      contexte.horloge.avancer(APRES_RETENTION)
      await registre.lire(contexte.draftId)
      await registre.annulerRevendication({
        id: contexte.draftId,
        tentativeId: TENTATIVE,
      })
      return await observe(
        await revendiquer(registre, contexte, TENTATIVE_RIVALE),
        registre,
        contexte
      )
    },
  },
  {
    nom: "ne pas défaire une promotion confirmée",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      await revendiquer(registre, contexte, TENTATIVE)
      await registre.confirmerPromotion({
        id: contexte.draftId,
        tentativeId: TENTATIVE,
        productId: contexte.produits[0],
        publicUrl: "https://cdn.example.test/promue.png",
      })
      await registre.annulerRevendication({
        id: contexte.draftId,
        tentativeId: TENTATIVE,
      })
      return await observe(
        await revendiquer(registre, contexte, TENTATIVE_RIVALE),
        registre,
        contexte
      )
    },
  },
  {
    nom: "confirmer la promotion d'un Brouillon revendiqué",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      await revendiquer(registre, contexte, TENTATIVE)
      return await observe(
        await registre.confirmerPromotion({
          id: contexte.draftId,
          tentativeId: TENTATIVE,
          productId: contexte.produits[0],
          publicUrl: "https://cdn.example.test/promue.png",
        }),
        registre,
        contexte
      )
    },
  },
  {
    nom: "confirmer deux fois la même promotion",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      await revendiquer(registre, contexte, TENTATIVE)
      const confirmation = {
        id: contexte.draftId,
        tentativeId: TENTATIVE,
        productId: contexte.produits[0],
        publicUrl: "https://cdn.example.test/promue.png",
      }
      await registre.confirmerPromotion(confirmation)
      return await observe(
        await registre.confirmerPromotion(confirmation),
        registre,
        contexte
      )
    },
  },
  {
    nom: "refuser la confirmation d'une promotion déjà liée à un autre Produit",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      await revendiquer(registre, contexte, TENTATIVE)
      await registre.confirmerPromotion({
        id: contexte.draftId,
        tentativeId: TENTATIVE,
        productId: contexte.produits[0],
        publicUrl: "https://cdn.example.test/promue.png",
      })
      return await observe(
        await registre.confirmerPromotion({
          id: contexte.draftId,
          tentativeId: TENTATIVE,
          productId: contexte.produits[1],
          publicUrl: "https://cdn.example.test/promue.png",
        }),
        registre,
        contexte
      )
    },
  },
  {
    nom: "refuser la confirmation d'un Brouillon non revendiqué",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      return await observe(
        await registre.confirmerPromotion({
          id: contexte.draftId,
          tentativeId: TENTATIVE,
          productId: contexte.produits[0],
          publicUrl: "https://cdn.example.test/promue.png",
        }),
        registre,
        contexte
      )
    },
  },
  {
    nom: "refuser la confirmation par une autre tentative",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      await revendiquer(registre, contexte, TENTATIVE)
      return await observe(
        await registre.confirmerPromotion({
          id: contexte.draftId,
          tentativeId: TENTATIVE_RIVALE,
          productId: contexte.produits[0],
          publicUrl: "https://cdn.example.test/promue.png",
        }),
        registre,
        contexte
      )
    },
  },
  {
    nom: "refuser un état ni vivant ni à rétention dépassée",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      contexte.horloge.avancer(APRES_RETENTION)
      await registre.lire(contexte.draftId)
      contexte.horloge.fixer(DATE_INITIALE)
      return await observe(
        await revendiquer(registre, contexte, TENTATIVE),
        registre,
        contexte
      )
    },
  },
  {
    nom: "lire les Brouillons d'une tentative dans l'ordre de leur création",
    async jouer(registre, contexte) {
      const premier = randomUUID()
      const second = randomUUID()
      await creerBrouillon(registre, contexte, premier)
      await revendiquer(
        registre,
        contexte,
        TENTATIVE,
        contexte.proprietaire,
        premier
      )
      contexte.horloge.avancer(1)
      await creerBrouillon(registre, contexte, second)
      await revendiquer(
        registre,
        contexte,
        TENTATIVE,
        contexte.proprietaire,
        second
      )
      return {
        tentative: (await registre.lireParTentative(TENTATIVE)).map(projetEtat),
        inconnue: (await registre.lireParTentative("tentative-inconnue")).map(
          projetEtat
        ),
      }
    },
  },
  {
    nom: "ne pas rendre les Brouillons d'une autre tentative",
    async jouer(registre, contexte) {
      const mienne = randomUUID()
      const autre = randomUUID()
      await creerBrouillon(registre, contexte, mienne)
      await creerBrouillon(registre, contexte, autre)
      await revendiquer(
        registre,
        contexte,
        TENTATIVE,
        contexte.proprietaire,
        mienne
      )
      await revendiquer(
        registre,
        contexte,
        TENTATIVE_RIVALE,
        contexte.proprietaire,
        autre
      )
      return {
        mienne: (await registre.lireParTentative(TENTATIVE)).map(projetEtat),
        rivale: (await registre.lireParTentative(TENTATIVE_RIVALE)).map(
          projetEtat
        ),
      }
    },
  },
  {
    nom: "ne plus rendre un Brouillon dont la revendication a été rendue",
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      await revendiquer(registre, contexte, TENTATIVE)
      const avant = (await registre.lireParTentative(TENTATIVE)).map(projetEtat)
      await registre.annulerRevendication({
        id: contexte.draftId,
        tentativeId: TENTATIVE,
      })
      return {
        avant,
        apres: (await registre.lireParTentative(TENTATIVE)).map(projetEtat),
      }
    },
  },
]

export const CODES_REFUS_CONTRAT: Record<CodeRefusRegistreBrouillon, true> = {
  introuvable: true,
  "proprietaire-incorrect": true,
  "non-vivant": true,
  expire: true,
  "deja-revendique": true,
  "deja-libere": true,
}

async function rejouer(
  scenario: ScenarioRegistre,
  adaptateur: AdaptateurRegistre,
  identite: IdentiteRegistre
): Promise<unknown> {
  const horloge = creerHorlogeControllable(DATE_INITIALE)
  return scenario.jouer(adaptateur(horloge.horloge), {
    ...identite,
    draftId: randomUUID(),
    horloge,
  })
}

export async function exigerEnteteRegistre(
  scenario: ScenarioRegistre,
  adaptateurs: readonly AdaptateurRegistre[],
  identite: IdentiteRegistre
): Promise<readonly unknown[]> {
  const observations: unknown[] = []
  for (const adaptateur of adaptateurs) {
    observations.push(await rejouer(scenario, adaptateur, identite))
  }
  const [reference, ...autres] = observations
  for (const autre of autres) {
    expect(autre, `${scenario.nom} — accord entre les adaptateurs`).toEqual(
      reference
    )
  }
  return observations
}

export function codesRefus(observation: unknown): string[] {
  const codes: string[] = []
  const visiter = (valeur: unknown): void => {
    if (Array.isArray(valeur)) {
      valeur.forEach(visiter)
      return
    }
    if (!valeur || typeof valeur !== "object") return
    for (const [cle, contenu] of Object.entries(valeur)) {
      if (cle === "code" && typeof contenu === "string") codes.push(contenu)
      else visiter(contenu)
    }
  }
  visiter(observation)
  return codes
}
