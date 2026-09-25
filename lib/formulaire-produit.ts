import type {
  EntreeBrouillonImage,
  EntreeImagePersistee,
} from "@/lib/galerie-image-produit"
import { centsToInputValue, parseMadToCents } from "@/lib/money"

/**
 * Le langage du formulaire Produit — module neutre, sans directive.
 *
 * Propriétaire unique de ce que le formulaire produit sait dire : la forme de
 * ses faits (`FaitsFormulaireProduit`, `FaitsVarianteFormulaire` et
 * l'entrée de galerie `EntreeImageProduitFormulaire`), le format ligne à ligne
 * du champ Spécifications dans **les deux sens** (`texteSpecifications` /
 * `specificationsDepuisTexte`) et la paire d'affichage et de lecture de
 * l'écart de prix d'une Variante (`texteEcartPrix` /
 * `ecartPrixDepuisTexte`).
 *
 * Ces quatre choses vivaient ailleurs et ne s'accordaient que par convention :
 * la page d'édition typait sa projection par les props d'un module de rendu
 * client, le module de rendu déclarait la même forme une seconde fois, la
 * moitié d'écriture du langage des spécifications était une expression
 * `Object.entries(...).join("\n")` nue dans un `defaultValue`, et la moitié de
 * lecture était un `parseSpecsText` privé dans l'action serveur. Aucune des
 * deux moitiés n'était exportée, nommée ni testée. Le module de rendu client
 * et l'action serveur les atteignent aujourd'hui tous deux par ici, et la suite
 * `formulaire-produit.test.ts` énonce l'aller-retour.
 *
 * **L'invariant : un éditeur voit et enregistre exactement ce qu'il voyait et
 * enregistrait.** Le texte par défaut du champ Spécifications, son libellé et
 * son exemple sont inchangés ; une ligne sans deux-points est refusée avec le
 * message d'aujourd'hui, au caractère près ; un écart de prix illisible reste
 * enregistré à zéro. Le refus est une `Error` simple et non une
 * `UserFacingError`, **parce qu'il est levé pendant la lecture de la
 * soumission** : l'enveloppe de mutation partagée transforme alors n'importe
 * quelle levée en `{ error: <message> }`. Changer la classe changerait le
 * comportement.
 *
 * L'encodage de l'écart de prix ne change pas : le prix de base reste une
 * chaîne décimale lue par l'aide d'argent partagée, et chaque écart reste un
 * nombre JSON de centimes dans le champ caché `variants`. Ce module ne
 * ré-dérive donc aucune conversion — il appelle `centsToInputValue` et
 * `parseMadToCents` de `@/lib/money`, sans les recalculer.
 *
 * **Limitation enregistrée :** ce format ne sait pas représenter une valeur
 * contenant un saut de ligne — une telle valeur se scinderait en deux lignes à
 * l'enregistrement. L'aller-retour est donc garanti pour les records dont les
 * clés et les valeurs n'en contiennent pas ; aucune n'existe aujourd'hui. La
 * limite est consignée ici, pas corrigée.
 *
 * NE JAMAIS ajouter `"use client"` ici : le module est destiné aux deux côtés
 * de la couture, comme `lib/carte-produit.ts` — le composant client qui rend
 * le formulaire comme l'action serveur qui le reçoit.
 *
 * NE JAMAIS importer `@/lib/db` (ni `next/headers`, ni `server-only`, ni
 * `@/lib/use-cases/mutation-actions`, qui tire `next/navigation` et donc la
 * session serveur) ici : un import serveur réintroduirait `pg`
 * (`require('dns')`) dans le bundle navigateur et casserait `next build`
 * (Turbopack). Le graphe de valeur se réduit à `@/lib/money` ; la galerie
 * n'est jointe que **par type**, depuis `@/lib/galerie-image-produit`, parce
 * qu'un module neutre ne doit pas typer par un composant `"use client"`. La
 * garde `formulaire-produit-frontiere.test.ts` verrouille cette neutralité.
 *
 * Non-buts : le transport du `FormData` vers le `ProductInput` de la mutation
 * (une seule fonction, et l'entrée de la mutation n'y est atteinte que **par
 * type**) ; les validations et les refus du Catalogue, qui restent derrière
 * l'interface de la mutation ; la normalisation des colonnes JSON lues depuis
 * la base, qui appartient aux lectures ; les métriques de prix et de stock,
 * qui restent à `@/lib/product-metrics`.
 */

/**
 * Les faits d'une Variante dans le formulaire : son identité persistée quand
 * elle existe, son nom, son SKU, son écart de prix **en centimes** et son
 * stock. Forme unique — elle remplace la déclaration seconde que le module de
 * rendu faisait de l'entrée de la mutation.
 */
export interface FaitsVarianteFormulaire {
  id?: string
  name: string
  sku: string
  priceDelta: number
  stock: number
}

/**
 * Les faits d'un Produit dans le formulaire : son identité persistée quand il
 * existe, ses libellés, son prix de base en centimes, ses drapeaux de
 * présentation, ses spécifications, sa galerie et ses Variantes. Forme unique
 * — c'est elle que la page d'édition déclare, et non plus les props d'un
 * module de rendu client.
 */
export interface FaitsFormulaireProduit {
  id?: string
  name: string
  slug: string
  brand: string
  categoryId: string
  description: string
  price: number
  isFeatured: boolean
  featuredOrder: number
  freeShipping: boolean
  specs: Record<string, string>
  images: EntreeImageProduitFormulaire[]
  variants: FaitsVarianteFormulaire[]
}

/**
 * Une entrée de la galerie telle que le formulaire la manipule : soit une
 * Image produit déjà persistée — avec la marque d'une suppression en attente,
 * que la soumission omettra — soit un Brouillon d'Image produit en cours
 * d'envoi. La forme est bâtie sur les types de `@/lib/galerie-image-produit`
 * et vit ici, dans un module neutre, pour qu'aucun module neutre n'ait à
 * typer par un composant `"use client"`.
 */
export type EntreeImageProduitFormulaire =
  | (EntreeImagePersistee & { suppressionEnAttente?: boolean })
  | EntreeBrouillonImage

/**
 * Écrit les spécifications dans le langage du champ : une ligne
 * `Clé : valeur` par entrée, dans l'ordre du record, séparées par un saut de
 * ligne ; un record vide donne un champ vide. C'est la moitié d'écriture du
 * langage — sa moitié de lecture est `specificationsDepuisTexte`, et les deux
 * vivent ici.
 *
 * Limitation : une clé ou une valeur contenant un saut de ligne ne survivrait
 * pas à l'enregistrement. L'aller-retour est garanti pour les records dont les
 * clés et les valeurs n'en contiennent pas.
 */
export function texteSpecifications(specs: Record<string, string>): string {
  return Object.entries(specs)
    .map(([cle, valeur]) => `${cle} : ${valeur}`)
    .join("\n")
}

/**
 * Relit le langage du champ : une ligne `Clé : valeur` donne une entrée, les
 * lignes vides sont sautées, et **le premier** deux-points sépare — une
 * valeur qui en contient un survit donc telle quelle, ce qui garde intacte une
 * liste de ports ou d'options. Une clé, en revanche, ne peut pas en contenir
 * un, sans quoi la ligne se scinderait à la lecture. Les deux côtés sont
 * rognés. Une ligne non vide sans deux-points — ou dont le deux-points est le
 * premier caractère, donc une clé vide — est refusée : la `Error` est simple,
 * pas une `UserFacingError`, parce qu'elle est levée pendant la lecture de la
 * soumission et que l'enveloppe de mutation partagée transforme alors
 * n'importe quelle levée en `{ error: <message> }`.
 */
export function specificationsDepuisTexte(
  texte: string
): Record<string, string> {
  const specs: Record<string, string> = {}
  for (const ligne of texte.split("\n")) {
    const rognee = ligne.trim()
    if (!rognee) continue
    const deuxPoints = rognee.indexOf(":")
    if (deuxPoints <= 0) {
      throw new Error(
        "Format de spécifications invalide (clé : valeur par ligne)"
      )
    }
    specs[rognee.slice(0, deuxPoints).trim()] = rognee
      .slice(deuxPoints + 1)
      .trim()
  }
  return specs
}

/**
 * Écrit l'écart de prix d'une Variante pour l'affichage : des dirhams que
 * l'éditeur lit, via l'aide d'argent partagée. Le nombre stocké reste en
 * centimes — l'affichage ne fait que le rendre lisible.
 */
export function texteEcartPrix(cents: number): string {
  return centsToInputValue(cents)
}

/**
 * Relit l'écart de prix tapé par l'éditeur, en centimes. Une valeur que
 * l'aide d'argent partagée ne sait pas lire — un champ vidé, une saisie
 * intermédiaire — **retombe à zéro** : l'éditeur est en train de taper, et une
 * valeur qu'on ne sait pas saisir doit s'enregistrer à zéro, pas être refusée.
 */
export function ecartPrixDepuisTexte(texte: string): number {
  return parseMadToCents(texte) ?? 0
}
