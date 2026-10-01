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

/**
 * Le contrat que les deux adaptateurs du registre rejouent côte à côté.
 *
 * **Ce qu'il tient désormais, c'est le stockage.** Les deux adaptateurs
 * appellent la même fonction de classification, donc ils ne peuvent plus
 * diverger sur ce qu'un refus est : ce serait un bug dans la règle, et la règle
 * a sa propre suite, où elle est épinglée sans base et sans doublure. Ce qui
 * reste propre à un adaptateur, c'est comment la rangée est écrite et relue —
 * la comparaison-and-échange, les transactions, la rangée telle qu'elle
 * persiste, la confirmation d'une promotion, une libération.
 *
 * Une couture qui a deux adaptateurs est une couture réelle, et il en reste
 * une : la libération d'un Brouillon dont la rétention est dépassée, que la
 * base refuse et qu'un adaptateur de mémoire accepterait sans laisser de trace.
 * Le contrat n'épingle donc aucune valeur attendue : il rejoue le même scénario
 * sur chaque adaptateur et affirme que les deux répondent la même observation —
 * le même refus, le même résultat, le même état restant. Une divergence échoue
 * ici au lieu de se cacher derrière une suite verte, et l'adaptateur durable
 * reste la référence parce qu'il est la base.
 *
 * Sept scénarios ont quitté ce fichier pour la suite de la classification : ils
 * portaient sur ce que la classification décide, non sur la façon dont la rangée
 * est stockée. Ils y sont repris sous leurs noms d'ici, pour qu'un scénario
 * déplacé se reconnaisse. Trois refus du port ne sont donc plus atteints par un
 * scénario d'ici — la table `CODES_REFUS_CONTRAT` dit lesquels, et la garde de
 * non-vacuité les épingle de l'autre côté.
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
 * l'assertion. Tous portent sur le **stockage** — la comparaison-and-échange, les
 * transactions, la rangée persistée, la confirmation d'une promotion, une
 * libération — et aucun sur ce que la classification décide, que les deux
 * adaptateurs appliquent de la même façon par construction.
 *
 * Les refus qu'ils produisent sont énumérés par `CODES_REFUS_CONTRAT`, que la
 * suite vérifie — sans quoi un contrat qui ne refuserait plus rien passerait
 * aussi facilement qu'un contrat juste.
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
    nom: "rejouer une revendication déjà gagnée, rétention échue entre-temps",
    // L'ordre des deux barreaux, et rien d'autre. La rétention limite une
    // *nouvelle* revendication : la tentative avait déjà pris ce Brouillon, et
    // son rejeu doit aboutir même après que le temps a passé. Une échelle qui
    // regarderait la rétention d'abord rendrait un refus ici, et l'adaptateur en
    // mémoire — qui rend le verdict partagé — un succès.
    async jouer(registre, contexte) {
      await creerBrouillon(registre, contexte)
      await revendiquer(registre, contexte, TENTATIVE)
      contexte.horloge.avancer(APRES_RETENTION)
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
]

/**
 * Où chaque refus du port est witnessed — « ici » par un scénario du contrat,
 * « classification » par la règle partagée, dont les deux adaptateurs font la
 * même application et ne peuvent donc pas diverger dessus.
 *
 * Une suite qui énumère ses refus prouve qu'elle n'est pas vide : un accord
 * obtenu parce que les deux adaptateurs ne refusent plus rien n'est pas un
 * accord. Trois codes ont quitté le contrat avec les scénarios de classification
 * qui les produisaient. Les y sortir était juste — ils se decidaient dans une
 * fonction, pas dans un stockage — mais la garde ne devait pas voyager avec eux
 * sans dire où elle était allée : elle dit, et `classification` n'est pas une
 * case vide, c'est une suite qui épingle les six.
 *
 * C'est un `Record` du code au témoin, pas un tableau de codes : le type est la
 * clé, donc TypeScript exige **toutes** les clés de
 * `CodeRefusRegistreBrouillon`. Un code ajouté au port sans témoin ici est une
 * erreur de compilation, jamais un refus qu'une des deux gardes laisserait
 * passer en silence.
 */
export const CODES_REFUS_CONTRAT: Record<CodeRefusRegistreBrouillon, Temoin> = {
  introuvable: "ici",
  "deja-revendique": "ici",
  "deja-libere": "ici",
  "proprietaire-incorrect": "classification",
  "non-vivant": "classification",
  expire: "classification",
}

export type Temoin = "ici" | "classification"

/** Les refus qu'un scénario du contrat doit atteindre, selon la table. */
export function codesAttendusParLeContrat(): CodeRefusRegistreBrouillon[] {
  return (Object.keys(CODES_REFUS_CONTRAT) as CodeRefusRegistreBrouillon[])
    .filter((code) => CODES_REFUS_CONTRAT[code] === "ici")
    .sort()
}

/** Les refus que la règle partagée doit savoir rendre, tous. */
export function tousLesCodesDuPort(): CodeRefusRegistreBrouillon[] {
  return (
    Object.keys(CODES_REFUS_CONTRAT) as CodeRefusRegistreBrouillon[]
  ).sort()
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
