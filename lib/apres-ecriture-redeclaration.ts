import {
  CHARGES_PAR_DECLENCHEUR,
  type Charge,
  type TypeEvenementAutomation,
} from "@/lib/automations/charge"
import { ContratChargeError } from "@/lib/automations/evenements"
import {
  BRANCHE_SANS_STRUCTURE,
  declarerApresEcriture,
  type GenreEcriture,
  type PlanApresEcriture,
} from "@/lib/apres-ecriture"

/**
 * Le genre d'écriture qu'un Événement d'automatisation redéclare. Les genres
 * groupés n'y figurent pas : ils émettent des Événements unitaires, donc c'est
 * la déclaration unitaire qui est redéclarée. Les déclencheurs planifiés n'ont
 * pas de genre et gardent leurs actions.
 */
export const GENRE_PAR_DECLENCHEUR: Partial<
  Record<TypeEvenementAutomation, GenreEcriture>
> = {
  "commande.creee": "commande.creee",
  "commande.statut.changee": "commande.statut.changee",
  "produit.enregistre": "produit.enregistre",
  "produit.supprime": "produit.supprime",
  "variante.stock.changee": "variante.stock.changee",
  "structure.creee": "structure.creee",
  "structure.modifiee": "structure.modifiee",
  "structure.supprimee": "structure.supprimee",
}

export interface Redeclaration {
  genre: GenreEcriture
  plan: PlanApresEcriture
}

/**
 * La charge est un contrat fermé : le travailleur et le réessai manuel la
 * valident par le même chemin, avec la même erreur nommée et le même message
 * de violation.
 */
export function analyserCharge<D extends TypeEvenementAutomation>(
  type: D,
  charge: unknown
): Charge<D> {
  const resultat = CHARGES_PAR_DECLENCHEUR[type].safeParse(charge)
  if (!resultat.success) {
    const issue = resultat.error.issues[0]
    const champ = issue?.path?.length ? issue.path.join(".") : "charge"
    throw new ContratChargeError(
      `Contrat de charge violé pour « ${type} » : ${champ} — ${
        issue?.message ?? "invalide"
      }`
    )
  }
  return resultat.data as Charge<D>
}

/**
 * Redéclare le plan unitaire d'un Événement depuis une Charge **déjà
 * analysée**. L'identifiant que la Charge omet — la Commande créée, la
 * Structure créée, etc. — est complété par l'identifiant d'entité de
 * l'Événement. Un déclencheur planifié rend `null` : il n'a pas de genre.
 *
 * Le `switch` prouve la branche ; chaque `case` resserre la Charge, reçue
 * comme l'union des contrats, à celui de son déclencheur.
 */
export function declarerDepuisLaChargeValidee(
  type: TypeEvenementAutomation,
  entityId: string,
  charge: Charge<TypeEvenementAutomation>
): Redeclaration | null {
  const genre = GENRE_PAR_DECLENCHEUR[type]
  if (!genre) return null

  switch (type) {
    case "commande.creee": {
      const c = charge as Charge<"commande.creee">
      return {
        genre,
        plan: declarerApresEcriture(genre, {
          commandeId: entityId,
          snapshot: c.snapshot,
        }),
      }
    }
    case "commande.statut.changee": {
      const c = charge as Charge<"commande.statut.changee">
      return {
        genre,
        plan: declarerApresEcriture(genre, {
          commandeId: entityId,
          snapshot: c.snapshot,
          statut: c.statut,
        }),
      }
    }
    case "produit.enregistre": {
      const c = charge as Charge<"produit.enregistre">
      return {
        genre,
        plan: declarerApresEcriture(genre, {
          produitId: c.produitId,
          slug: c.slug,
          slugPrecedent: c.slugPrecedent,
          categoryId: c.categoryId,
          categoryIdPrecedent: c.categoryIdPrecedent,
          imagesRetirees: c.imagesRetirees,
        }),
      }
    }
    case "produit.supprime": {
      const c = charge as Charge<"produit.supprime">
      return {
        genre,
        plan: declarerApresEcriture(genre, {
          produitId: c.produitId,
          slug: c.slug,
          categoryId: c.categoryId,
          imagesRetirees: c.imagesRetirees,
        }),
      }
    }
    case "variante.stock.changee": {
      const c = charge as Charge<"variante.stock.changee">
      return {
        genre,
        plan: declarerApresEcriture(genre, { produitId: c.produitId }),
      }
    }
    case "structure.creee": {
      const c = charge as Charge<"structure.creee">
      return {
        genre,
        plan: declarerApresEcriture(genre, { categorieId: c.categorieId }),
      }
    }
    case "structure.modifiee": {
      const c = charge as Charge<"structure.modifiee">
      return {
        genre,
        plan: declarerApresEcriture(genre, {
          categorieId: c.categorieId,
          imagesRetirees: c.imagesRetirees,
          destinations: c.destinations,
        }),
      }
    }
    case "structure.supprimee": {
      const c = charge as Charge<"structure.supprimee">
      // Une Charge ancienne peut nommer l'orphelinat par le drapeau plutôt que
      // par la pseudo-destination : le plan redéclaré doit viser la même
      // branche, sans doublon.
      const destinations =
        c.produitsSansStructure === true &&
        !c.destinations.includes(BRANCHE_SANS_STRUCTURE)
          ? [...c.destinations, BRANCHE_SANS_STRUCTURE]
          : c.destinations
      return {
        genre,
        plan: declarerApresEcriture(genre, {
          categorieId: c.categorieId,
          imagesRetirees: c.imagesRetirees,
          destinations,
        }),
      }
    }
    default:
      return null
  }
}

/**
 * Le même chemin que le travailleur : la Charge est analysée une fois, puis
 * transmise au constructeur de faits déjà validé.
 */
export function declarerDepuisLaCharge(
  type: TypeEvenementAutomation,
  entityId: string,
  charge: unknown
): Redeclaration | null {
  if (!GENRE_PAR_DECLENCHEUR[type]) return null
  return declarerDepuisLaChargeValidee(
    type,
    entityId,
    analyserCharge(type, charge)
  )
}
