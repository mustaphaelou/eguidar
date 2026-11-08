import type { OrderEmailSnapshot } from "@/lib/automations/charge"
import type {
  ConsequenceCommande,
  PlanCommande,
  ProduitTouche,
  StatutCommande,
} from "@/lib/apres-ecriture"
import type { CatalogueEventProduct } from "@/lib/use-cases/cache-invalidation"
import { chaineDeLaStructure } from "@/lib/use-cases/cache-invalidation"
import type { LectureStructure } from "@/lib/use-cases/lecture-structure"
import {
  EffetNonPrisEnChargeError,
  journalEffetsConsole,
  type JournalEffetsPostCommit,
} from "@/lib/use-cases/mutation-squelette"

import {
  LectureManquanteError,
  executerPlan,
  executerUne as executerUneConséquence,
  type GestionnairesPour,
} from "./executeur"

/**
 * Les ports de la Commande que l'adaptateur projette. Ils sont structurellement
 * identiques à `OrderEffects` ; le type vit ici pour que l'adaptateur n'importe
 * pas le cas d'usage qui l'appelle.
 */
export interface EffetsCommande {
  sendOrderPlacedEmail(order: OrderEmailSnapshot): Promise<void>
  sendOrderStatusEmail(
    order: OrderEmailSnapshot,
    newStatus: StatutCommande
  ): Promise<void>
  invalidateCommande(orderId: string): void
  invalidateProduits(produits: readonly CatalogueEventProduct[]): Promise<void>
}

/**
 * Les lectures après commit de la Commande. La déclaration pure ne connaît pas
 * la chaîne de Structure ; l'adaptateur ne la lit que si une purge porte des
 * Produits, et une seule fois par plan.
 */
export interface LecturesCommande {
  structure?: () => Promise<Pick<LectureStructure, "filAriane">>
}

function memoise<T>(lire: () => Promise<T>): () => Promise<T> {
  let valeur: Promise<T> | undefined
  return () => (valeur ??= lire())
}

function gestionnaires(
  effets: EffetsCommande,
  lectures: LecturesCommande
): GestionnairesPour<ConsequenceCommande> {
  const structure = memoise(() => {
    if (!lectures.structure) throw new LectureManquanteError("structure")
    return lectures.structure()
  })

  async function evenementsCatalogue(
    produits: readonly ProduitTouche[]
  ): Promise<CatalogueEventProduct[]> {
    const lecture = await structure()
    return produits.map((produit) => ({
      id: produit.id,
      slug: produit.slug,
      categoryChain: chaineDeLaStructure(lecture, produit.categoryId),
    }))
  }

  return {
    email: (consequence) => {
      if (consequence.action === "email.commande-creee") {
        return effets.sendOrderPlacedEmail(consequence.payload.snapshot)
      }
      if (consequence.action === "email.commande-statut") {
        const statut = consequence.payload.statut
        if (!statut) throw new EffetNonPrisEnChargeError(consequence.effet)
        return effets.sendOrderStatusEmail(consequence.payload.snapshot, statut)
      }
      throw new EffetNonPrisEnChargeError(consequence.effet)
    },
    "invalidation-cache": (consequence) =>
      effets.invalidateCommande(consequence.payload.commandeId),
    "purge-catalogue": async (consequence) => {
      const produits = consequence.payload.produits
      // Une Commande sans Produit drainé ne lit pas la Structure : la purge
      // n'a rien à résoudre, mais elle reste une conséquence adaptée.
      await effets.invalidateProduits(
        produits.length === 0 ? [] : await evenementsCatalogue(produits)
      )
    },
  }
}

/**
 * La tentative immédiate d'un plan de Commande : ordre déclaré, isolation,
 * mesure et journal, jamais d'exception.
 */
export async function executer(
  plan: PlanCommande,
  effets: EffetsCommande,
  lectures: LecturesCommande = {},
  journal: JournalEffetsPostCommit = journalEffetsConsole
): Promise<void> {
  await executerPlan(plan, gestionnaires(effets, lectures), journal)
}

/**
 * Une conséquence de Commande pour le travailleur : l'échec remonte, c'est lui
 * qui fait échouer l'Exécution et déclenche la reprise.
 */
export async function executerUne(
  consequence: ConsequenceCommande,
  effets: EffetsCommande,
  lectures: LecturesCommande = {}
): Promise<void> {
  await executerUneConséquence(consequence, gestionnaires(effets, lectures))
}
