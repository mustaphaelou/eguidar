import { randomUUID } from "node:crypto"

import { expect } from "vitest"

import type {
  BrouillonImageProduit,
  PortRegistreBrouillonImageProduit,
} from "@/lib/cycle-vie-image-produit"
import {
  creerHorlogeControllable,
  type HorlogeControllable,
} from "@/test/cycle-vie-image-produit-memoire"

/**
 * Le contrat que les deux adaptateurs du registre rejouent côte à côte.
 *
 * Une couture qui a deux adaptateurs est une couture réelle ; celle-ci avait
 * deux réponses là où elle n'en avait qu'une. Le contrat n'épingle donc aucune
 * valeur attendue : il rejoue le même scénario sur chaque adaptateur et
 * affirme que les deux répondent la même observation — le même refus, le même
 * résultat, le même état restant. Une divergence échoue ici au lieu de se
 * cacher derrière une suite verte, et l'adaptateur durable reste la référence
 * parce qu'il est la base.
 *
 * Il vit dans `test/` et non dans une suite parce que les assertions
 * réellement identiques méritent un seul endroit : chaque suite garde ensuite ses
 * propres invariants dans son propre fichier (cf. `test/mutation-squelette-recette.ts`).
 */

const DATE_INITIALE = new Date("2026-05-01T10:00:00.000Z")
const RETENTION_H = 24
const MS_PAR_H = 60 * 60 * 1000
const TENTATIVE = "tentative-1"
const TENTATIVE_RIVALE = "tentative-2"

const expiration = () =>
  new Date(DATE_INITIALE.getTime() + RETENTION_H * MS_PAR_H)

/** Une milliseconde après la rétention : l'état `expiré` est acquis. */
const APRES_RETENTION = RETENTION_H * MS_PAR_H + 1

/**
 * L'état que le contrat observe, réduit à ce que le cycle de vie décide. Les
 * identifiants sont exclus : un rejeu reçoit son propre Brouillon, et la
 * rétention y est une entrée, pas une sortie — elle doit ressortir identique
 * des deux côtés, à la milliseconde près.
 */
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

/**
 * La réponse d'une opération du port, ramenée à une forme comparable. Seul le
 * *code* du refus entre dans la comparaison : le message est le vocabulaire de
 * l'adaptateur, et le module propriétaire compose le sien à partir du code —
 * l'éditeur lit toujours celui du module, jamais celui du registre. Comparer
 * les messages astreindrait les deux adaptateurs à redire la même prose pour
 * un texte que personne ne voit.
 */
function projetReponse(reponse: unknown): unknown {
  if (reponse === null || typeof reponse !== "object") return reponse
  const objet = reponse as Record<string, unknown>
  if (!("ok" in objet)) return projetEtat(reponse as BrouillonImageProduit)
  if (objet.ok === true) {
    return { ok: true, value: projetEtat(objet.value as BrouillonImageProduit) }
  }
  return { ok: false, code: objet.code }
}

/** Un registre rejoué dans les mêmes conditions initiales qu'un autre. */
export type AdaptateurRegistre = (
  horloge: HorlogeControllable["horloge"]
) => PortRegistreBrouillonImageProduit

/**
 * Ce dont le registre durable a besoin de la base : un éditeur réel, un autre
 * éditeur réel, et deux Produits réels — confirmer une promotion écrit une clé
 * étrangère. L'adaptateur en mémoire s'en passe, et c'est bien pour cela que
 * le contrat ne peut rien supposer de la base.
 */
export interface IdentiteRegistre {
  readonly proprietaire: string
  readonly autreProprietaire: string
  readonly produits: readonly [string, string]
}

export interface ContexteScenario extends IdentiteRegistre {
  /** Un Brouillon neuf à chaque rejeu : le registre durable a une clé primaire. */
  readonly draftId: string
  readonly horloge: HorlogeControllable
}

export interface ScenarioRegistre {
  readonly nom: string
  /**
   * Le scénario, écrit une seule fois et rejoué par chaque adaptateur. Il ne
   * rend qu'une observation comparable : l'accord que le contrat cherche.
   */
  jouer(
    registre: PortRegistreBrouillonImageProduit,
    contexte: ContexteScenario
  ): Promise<unknown>
}

function creerBrouillon(
  registre: PortRegistreBrouillonImageProduit,
  contexte: ContexteScenario
): Promise<BrouillonImageProduit> {
  return registre.creer({
    id: contexte.draftId,
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

/** Une observation, toujours sous la même forme : ce qu'on a obtenu, puis l'état. */
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

/**
 * Les scénarios du contrat. Chacun se lit comme une phrase du cycle de vie, et
 * aucun n'écrit la valeur attendue : l'accord entre les deux adaptateurs est
 * l'assertion. Les refus qu'ils produisent sont énumérés par
 * `CODES_REFUS_CONTRAT`, que la suite vérifie — sans quoi un contrat qui ne
 * refuserait plus rien passerait aussi facilement qu'un contrat juste.
 */
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
    // La divergence du ticket : l'adaptateur en mémoire réussissait cette
    // libération, le registre durable la refuse et résout l'expiration. Le
    // contrat oblige les deux à répondre pareil, donc à refuser.
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
    // L'autre divergence du ticket : la compensation d'une revendication dont
    // la rétention est échue. Rendre `vivant` un Brouillon expiré le rendrait
    // revendicable alors que son objet a pu être supprimé par la règle de cycle
    // de vie R2.
    //
    // C'est le **registre durable** qui ressuscitait, pas l'adaptateur en
    // mémoire : celui-ci exigeait déjà `revendiqué` pour annuler. Le contrat
    // impose donc la même précondition des deux côtés, et c'est le durable qui
    // change — l'inverse de ce que la prose de la spec racontait, ce qu'on peut
    // vérifier ici en rejouant le scénario contre l'ancien comportement.
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
    // Un état `expiré` dont la rétention n'est pas encore passée ne peut pas
    // se produire en production, l'horloge ne recule pas. Le scénario le rejoue
    // pour que les deux adaptateurs classent le même état de la même façon, et
    // pas l'un comme expiré, l'autre comme simplement non vivant.
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
]

/**
 * Les codes de refus que le contrat doit atteindre. Une suite qui les énumère
 * prouve que le contrat n'est pas vide : un accord obtenu parce que les deux
 * adaptateurs ne refusent plus rien n'est pas un accord.
 */
export const CODES_REFUS_CONTRAT: readonly string[] = [
  "introuvable",
  "proprietaire-incorrect",
  "non-vivant",
  "expire",
  "deja-revendique",
  "deja-libere",
]

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

/**
 * Rejoue un scénario sur chaque adaptateur, dans les mêmes conditions de départ,
 * et affirme que tous répondent la même observation. Rend les observations, pour
 * qu'une suite puisse en déduire les refus que le contrat atteint.
 */
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

/** Les codes de refus qu'une observation contient, à quelque profondeur. */
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
