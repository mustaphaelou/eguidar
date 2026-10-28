import type {
  TypeEntiteAutomation,
  TypeEvenementAutomation,
} from "@/lib/automations/evenements"

export type { TypeEntiteAutomation, TypeEvenementAutomation }
import type {
  DeclencheurExecution,
  StatutAutomation,
} from "@/lib/generated/prisma/client"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

/**
 * Le vocabulaire fermé de l'éditeur de Règles (ADR-0041). Le module est pur :
 * il ne touche ni la base, ni le travailleur, pour que le formulaire client et
 * le serveur lisent exactement la même liste.
 */

export const ACTIONS_AUTOMATION = Object.freeze([
  "email.commande-creee",
  "email.commande-statut",
  "index.produit",
  "desindex.produit",
  "invalidation.catalogue",
  "invalidation.structure",
  "purge.catalogue",
  "digest.stock-bas",
  "digest.proprietaire",
  "reconciliation.recherche",
] as const)

export type ActionAutomation = (typeof ACTIONS_AUTOMATION)[number]

export const CONDITIONS_AUTOMATION = Object.freeze([
  "toujours",
  "statut-commande",
] as const)

export type TypeConditionAutomation = (typeof CONDITIONS_AUTOMATION)[number]

export type ConditionAutomation =
  { type: "toujours" } | { type: "statut-commande"; statuts: readonly string[] }

export interface ConfigurationRegle {
  /** Un **nom** de variable d'environnement, jamais sa valeur. */
  destinataireVariable: string
}

export interface CompositionRegle {
  declencheur: TypeEvenementAutomation
  condition: { type: TypeConditionAutomation }
  action: ActionAutomation
  configuration?: ConfigurationRegle
}

/**
 * Un nom de variable d'environnement : majuscules, chiffres, souligné, et il
 * commence par une lettre. Une URL, une adresse ou une phrase sont refusées —
 * une règle ne porte jamais de valeur libre.
 */
export const NOM_DE_VARIABLE_ENVIRONNEMENT = /^[A-Z][A-Z0-9_]{0,63}$/

export function estNomDeVariableEnvironnement(valeur: string): boolean {
  return NOM_DE_VARIABLE_ENVIRONNEMENT.test(valeur)
}

export const LIBELLES_DECLENCHEUR: Readonly<
  Record<TypeEvenementAutomation, string>
> = Object.freeze({
  "commande.creee": "Commande créée",
  "commande.statut.changee": "Statut de Commande changé",
  "produit.enregistre": "Produit enregistré",
  "produit.supprime": "Produit supprimé",
  "variante.stock.changee": "Stock de Variante changé",
  "structure.creee": "Structure créée",
  "structure.modifiee": "Structure modifiée",
  "structure.supprimee": "Structure supprimée",
  "planification.digest-stock-bas": "Planification du digest du stock bas",
  "planification.reconciliation-recherche":
    "Planification de la réconciliation de la recherche",
})

/**
 * La liste complète des déclencheurs pour le formulaire client. Elle dérive
 * des libellés — un déclencheur sans libellé ne compilerait pas — pour que le
 * module reste pur (aucun import de la base ni du travailleur).
 */
export const DECLENCHEURS_AUTOMATION: readonly TypeEvenementAutomation[] =
  Object.freeze(Object.keys(LIBELLES_DECLENCHEUR) as TypeEvenementAutomation[])

export const LIBELLES_STATUT_EXECUTION: Readonly<
  Record<StatutAutomation, string>
> = Object.freeze({
  en_attente: "En attente",
  en_cours: "En cours",
  reussi: "Réussi",
  echoue: "Échoué",
  ignore: "Ignoré",
  mort: "File morte",
})

export const LIBELLES_DECLENCHEUR_EXECUTION: Readonly<
  Record<DeclencheurExecution, string>
> = Object.freeze({
  evenement: "Événement",
  planification: "Planification",
  manuel: "Manuel",
})

export const LIBELLES_ACTION: Readonly<Record<ActionAutomation, string>> =
  Object.freeze({
    "email.commande-creee": "E-mail de confirmation de Commande",
    "email.commande-statut": "E-mail de statut de Commande",
    "index.produit": "Indexer le Produit",
    "desindex.produit": "Désindexer le Produit",
    "invalidation.catalogue": "Invalider le Catalogue",
    "invalidation.structure": "Invalider la Structure",
    "purge.catalogue": "Purger le bord",
    "digest.stock-bas": "Digest du stock bas",
    "digest.proprietaire": "Digest du propriétaire",
    "reconciliation.recherche": "Réconcilier la recherche",
  })

export const LIBELLES_CONDITION: Readonly<
  Record<TypeConditionAutomation, string>
> = Object.freeze({
  toujours: "Toujours",
  "statut-commande": "Statut de Commande",
})

/** Les déclencheurs qu'une action sait consommer — la table de compatibilité. */
export const DECLENCHEURS_PAR_ACTION: Readonly<
  Record<ActionAutomation, readonly TypeEvenementAutomation[]>
> = Object.freeze({
  "email.commande-creee": ["commande.creee"],
  "email.commande-statut": ["commande.statut.changee"],
  "index.produit": ["produit.enregistre", "variante.stock.changee"],
  "desindex.produit": ["produit.supprime"],
  "invalidation.catalogue": ["produit.enregistre", "produit.supprime"],
  "invalidation.structure": [
    "structure.creee",
    "structure.modifiee",
    "structure.supprimee",
  ],
  "purge.catalogue": ["produit.enregistre"],
  "digest.stock-bas": ["planification.digest-stock-bas"],
  "digest.proprietaire": ["planification.digest-stock-bas"],
  "reconciliation.recherche": ["planification.reconciliation-recherche"],
})

/**
 * La table que chaque action écrit. Aucune action ne passe par un module de
 * mutation (la frontière du travailleur l'interdit déjà) : la liste est vide et
 * le restera tant qu'une action se contente d'un adaptateur. Le filtre existe
 * pour la règle, pas pour aujourd'hui.
 */
export const ENTITES_ECRITES_PAR_ACTION: Readonly<
  Record<ActionAutomation, readonly TypeEntiteAutomation[]>
> = Object.freeze({
  "email.commande-creee": [],
  "email.commande-statut": [],
  "index.produit": [],
  "desindex.produit": [],
  "invalidation.catalogue": [],
  "invalidation.structure": [],
  "purge.catalogue": [],
  "digest.stock-bas": [],
  "digest.proprietaire": [],
  "reconciliation.recherche": [],
})

/** La table que chaque déclencheur observe — ce qu'une boucle écrirait. */
export const ENTITE_OBSERVEE_PAR_DECLENCHEUR: Readonly<
  Record<TypeEvenementAutomation, TypeEntiteAutomation>
> = Object.freeze({
  "commande.creee": "commande",
  "commande.statut.changee": "commande",
  "produit.enregistre": "produit",
  "produit.supprime": "produit",
  "variante.stock.changee": "produit",
  "structure.creee": "categorie",
  "structure.modifiee": "categorie",
  "structure.supprimee": "categorie",
  "planification.digest-stock-bas": "planification",
  "planification.reconciliation-recherche": "planification",
})

export class CombinaisonRefusee extends UserFacingError {
  constructor(message: string) {
    super(message)
    this.name = "CombinaisonRefusee"
  }
}

/**
 * Écarte les actions qui écriraient la table que leur propre déclencheur
 * observe : une boucle ne peut donc pas être exprimée, plutôt que d'être
 * détectée après coup.
 */
export function filtrerSansBoucle<Action extends string>(
  actions: readonly Action[],
  ecritDans: Readonly<Record<Action, readonly TypeEntiteAutomation[]>>,
  entiteObservee: TypeEntiteAutomation
): Action[] {
  return actions.filter(
    (action) => !ecritDans[action]!.includes(entiteObservee)
  )
}

export function actionsOffertes(
  declencheur: TypeEvenementAutomation
): ActionAutomation[] {
  return filtrerSansBoucle(
    ACTIONS_AUTOMATION.filter((action) =>
      DECLENCHEURS_PAR_ACTION[action].includes(declencheur)
    ),
    ENTITES_ECRITES_PAR_ACTION,
    ENTITE_OBSERVEE_PAR_DECLENCHEUR[declencheur]
  )
}

export function declencheursOfferts(
  action: ActionAutomation
): TypeEvenementAutomation[] {
  return [...DECLENCHEURS_PAR_ACTION[action]]
}

export function conditionsOffertes(
  declencheur: TypeEvenementAutomation
): TypeConditionAutomation[] {
  return declencheur === "commande.statut.changee"
    ? [...CONDITIONS_AUTOMATION]
    : ["toujours"]
}

function libelleDuDeclencheur(declencheur: string): string {
  const libelle =
    LIBELLES_DECLENCHEUR[declencheur as TypeEvenementAutomation] ?? declencheur
  return `« ${libelle} » (${declencheur})`
}

function libelleDeLAction(action: string): string {
  const libelle = LIBELLES_ACTION[action as ActionAutomation] ?? action
  return `« ${libelle} » (${action})`
}

export function libelleDeLaCondition(condition: string): string {
  return (
    LIBELLES_CONDITION[condition as TypeConditionAutomation] ??
    String(condition)
  )
}

/**
 * La garde de l'éditeur : un déclencheur, une condition et une action ne se
 * composent pas au hasard. Le refus nomme la combinaison, jamais « invalide ».
 */
export function verifierCombinaison(composition: CompositionRegle): void {
  const { declencheur, condition, action, configuration } = composition

  if (!ACTIONS_AUTOMATION.includes(action)) {
    throw new CombinaisonRefusee(
      `Combinaison non prise en charge : l'action « ${action} » n'appartient pas au vocabulaire fermé.`
    )
  }

  const offre = actionsOffertes(declencheur)
  if (!offre.includes(action)) {
    throw new CombinaisonRefusee(
      `Combinaison non prise en charge : ${libelleDuDeclencheur(declencheur)} ne déclenche pas ${libelleDeLAction(action)}.`
    )
  }

  if (!conditionsOffertes(declencheur).includes(condition.type)) {
    throw new CombinaisonRefusee(
      `Combinaison non prise en charge : la condition « ${libelleDeLaCondition(condition.type)} » (${condition.type}) ne s'évalue pas sur ${libelleDuDeclencheur(declencheur)}.`
    )
  }

  if (configuration && !action.startsWith("digest.")) {
    throw new CombinaisonRefusee(
      `Combinaison non prise en charge : l'action ${libelleDeLAction(action)} n'admet pas de destinataire.`
    )
  }

  if (
    configuration &&
    !estNomDeVariableEnvironnement(configuration.destinataireVariable)
  ) {
    throw new CombinaisonRefusee(
      `Nom de variable d'environnement invalide : seules les majuscules, les chiffres et « _ » sont admis (reçu : « ${configuration.destinataireVariable} »).`
    )
  }
}
