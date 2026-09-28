import {
  galerieImageProduitSchema,
  type EntreeBrouillonImage,
  type EntreeImagePersistee,
  type EntreeImageProduit,
} from "@/lib/galerie-image-produit"
import { centsToInputValue, parseMadToCents } from "@/lib/money"
import type { ProductInput } from "@/lib/use-cases/admin-catalog"

/**
 * Le langage du formulaire Produit — module neutre, sans directive.
 *
 * Propriétaire unique de ce que le formulaire produit sait dire : la forme de
 * ses faits (`FaitsFormulaireProduit`, `FaitsVarianteFormulaire` et
 * l'entrée de galerie `EntreeImageProduitFormulaire`), le format ligne à ligne
 * du champ Spécifications dans **les deux sens** (`texteSpecifications` /
 * `specificationsDepuisTexte`), la paire d'affichage et de lecture de
 * l'écart de prix d'une Variante (`texteEcartPrix` /
 * `ecartPrixDepuisTexte`) et **tout le format de transport**, du `FormData`
 * soumis jusqu'à l'entrée de la mutation (`soumissionDepuisFormData`).
 *
 * Ces cinq choses vivaient ailleurs et ne s'accordaient que par convention :
 * la page d'édition typait sa projection par les props d'un module de rendu
 * client, le module de rendu déclarait la même forme une seconde fois, la
 * moitié d'écriture du langage des spécifications était une expression
 * `Object.entries(...).join("\n")` nue dans un `defaultValue`, la moitié de
 * lecture était un `parseSpecsText` privé dans l'action serveur, et le format
 * du câble lui-même — les noms de champs, les deux encodages monétaires, la
 * convention de case à cocher, le champ d'ordre, le JSON caché — n'était
 * lisible qu'en ouvrant un `.tsx` **et** l'action qui le recevait. Aucune des
 * deux moitiés du langage des spécifications n'était exportée, nommée ni
 * testée. Le module de rendu client et l'action serveur les atteignent
 * aujourd'hui tous deux par ici, et la suite `formulaire-produit.test.ts`
 * énonce l'aller-retour comme le transport.
 *
 * **L'invariant : un éditeur voit et enregistre exactement ce qu'il voyait et
 * enregistrait.** Le texte par défaut du champ Spécifications, son libellé et
 * son exemple sont inchangés ; une ligne sans deux-points est refusée avec le
 * message d'aujourd'hui, au caractère près ; un écart de prix illisible reste
 * enregistré à zéro ; un JSON caché illisible et un prix de base qu'on ne sait
 * pas lire sont refusés par `MESSAGE_FORMULAIRE_INVALIDE`, le caractère près.
 * Le refus est une `Error` simple et non une `UserFacingError`, **parce qu'il
 * est levé pendant la lecture de la soumission** : l'enveloppe de mutation
 * partagée transforme alors n'importe quelle levée en
 * `{ error: <message> }`. Changer la classe changerait le comportement.
 *
 * **Le transport ne valide rien de plus qu'avant, et ne refuse rien de moins.**
 * Il lit le câble et rend la main : les règles d'exécution restent celles de la
 * mutation du Catalogue. Le champ caché `variants` est relu par un
 * `JSON.parse` **sans validation zod** — c'est le `productInputSchema` de la
 * mutation qui le juge en aval, et le valider ici changerait le comportement ;
 * `featuredOrder` retombe à zéro quand la valeur n'est pas un nombre, et
 * passe tel quel au Catalogue quand elle est négative ou fractionnaire : c'est
 * la validation de la mutation qui refuse alors, pas le transport ; un Produit
 * **sans Variante** traverse le transport sans être refusé, comme le veut
 * ADR-0026. L'identification du Produit édité n'est **pas** ici :
 * `parseRequiredId` reste l'affaire de l'action, et ce module n'apprend pas
 * quelles actions ont besoin d'un identifiant.
 *
 * L'encodage de l'écart de prix ne change pas : le prix de base reste une
 * chaîne décimale lue par l'aide d'argent partagée, et chaque écart reste un
 * nombre JSON de centimes dans le champ caché `variants`. Ce module ne
 * ré-dérive donc aucune conversion — il appelle `centsToInputValue` et
 * `parseMadToCents` de `@/lib/money`, sans les recalculer, et c'est aussi
 * par elle qu'il lit le prix de base.
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
 * (Turbopack). Le **graphe de valeur se réduit à deux modules**,
 * `@/lib/money` (l'aide d'argent, sans import) et
 * `@/lib/galerie-image-produit` (zod est une bibliothèque client ordinaire :
 * ni base, ni module serveur, ni directive) — dont le transport doit le
 * schéma de la galerie, pour valider le champ caché `images` comme il l'est
 * aujourd'hui. `@/lib/use-cases/admin-catalog` n'est atteint que **par type**,
 * pour `ProductInput` : un import de type est effacé à la compilation, donc
 * l'entrée de la mutation est typée sans qu'aucune base ne soit atteinte à
 * l'exécution. Pour la même raison, le module n'importe **aucune** arête
 * `node:`, qu'un bundle navigateur ne pourrait pas résoudre. La garde
 * `formulaire-produit-frontiere.test.ts` verrouille cette neutralité.
 *
 * Non-buts : les validations et les refus du Catalogue, qui restent derrière
 * l'interface de la mutation ; l'identification du Produit édité, qui reste à
 * l'aide d'identifiant requis du mécanisme partagé de mutation ; le cycle de
 * vie des Images produit (revendication, promotion, propriété des Brouillons),
 * qui a son propre propriétaire ; la normalisation des colonnes JSON lues
 * depuis la base, qui appartient aux lectures ; les métriques de prix et de
 * stock, qui restent à `@/lib/product-metrics`.
 */

/**
 * Les faits d'une Variante dans le formulaire : son identité persistée quand
 * elle existe, son nom, son SKU, son écart de prix **en centimes** et son
 * stock. Forme unique — elle remplace la déclaration seconde que le module de
 * rendu faisait de l'entrée de la mutation.
 *
 * **Le nom se lit « les faits d'une Variante *dans le* formulaire ».** L'entité
 * décrite est la **Variante** ; la forme que prennent ces faits est celle
 * d'une ligne du formulaire Produit. C'est une tournure de dépendant — « la
 * Variante du formulaire » —, à l'inverse de `FaitsFormulaireProduit`, où
 * l'ordre est celui du complément de tête (comme dans « carte produit »). Les
 * deux noms sont exacts dans leur construction, et l'ordre n'est pas
 * interchangeable ; c'est pourquoi chacun énonce ici, en toutes lettres, de
 * quelle entité il parle et sous quelle forme.
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
 *
 * **Le nom se lit « les faits *du formulaire* du Produit ».** L'entité décrite
 * est le **Produit** ; la forme que prennent ces faits est la projection du
 * formulaire d'édition. « Formulaire Produit » est un complément de tête, dans
 * l'ordre du précedent `FaitsCarteProduit` (« carte produit ») — d'où l'ordre
 * des mots. Son complément symétrique, `FaitsVarianteFormulaire`, se lit à
 * l'inverse, « les faits de la Variante *dans le* formulaire » : c'est une
 * tournure de dépendant, le même couple entité/forme dans l'autre sens. Aucun
 * des deux noms n'est donc un doublon de l'autre : chacun dit de quoi il parle,
 * et c'est aussi ce que son commentaire dit.
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
 * Le refus d'une ligne de Spécifications qui n'a pas de deux-points. Le texte
 * est au caractère près celui d'aujourd'hui : le message est un fait du
 * formulaire, donc il a un propriétaire, et sa suite énonce le littéral exact
 * pour qu'une dérive soit impossible.
 */
export const MESSAGE_SPECIFICATIONS_INVALIDE =
  "Format de spécifications invalide (clé : valeur par ligne)"

/**
 * Le refus d'une soumission que le transport ne sait pas lire : un champ caché
 * `images` ou `variants` qui n'est pas du JSON, une galerie qui n'est pas une
 * galerie, un prix de base que l'aide d'argent partagée ne sait pas lire. Le
 * texte est au caractère près celui d'aujourd'hui.
 *
 * **Ce littéral existe deux fois, délibérément.** Le mécanisme partagé de
 * mutation est hors de la portée de ce travail — la spécification d'origine
 * l'y exclut — et garde son propre `INVALID_FORM_MESSAGE` pour
 * `parseMoneyField`, `parseRequiredId` et le statut de la Commande : ce sont
 * les refus d'un mécanisme entité-agnostique, dont il est le propriétaire.
 * Celui-ci est un autre refus, d'un autre propriétaire — le transport du
 * formulaire Produit — et il ne peut pas être emprunté à l'autre : ce module
 * atteint le type d'entrée de la mutation par un import de type seul, et
 * n'atteint pas `@/lib/use-cases/mutation-actions`, qui tirerait
 * `next/navigation` puis la session serveur dans le bundle navigateur. Les
 * deux chaînes sont égales au caractère près, ce que la suite énonce en les
 * comparant l'une à l'autre ; si l'une bouge, l'autre doit suivre.
 */
export const MESSAGE_FORMULAIRE_INVALIDE = "Formulaire invalide"

/**
 * Une soumission lue : ce que la mutation doit recevoir, la galerie telle que
 * le formulaire l'a soumise, et l'identifiant de tentative.
 *
 * Les trois parties se séparent parce que les trois ont des propriétaires
 * différents. `champsCatalogue` — le nom le dit, ce sont les **champs du
 * Catalogue**, tels que sa mutation les reçoit, à la galerie près : la mutation
 * range des URL, le formulaire soumet des entrées (persistées ou Brouillons)
 * que le cycle de vie des Images produit promeut avant qu'elles n'arrivent à
 * elle — et cette conversion n'appartient ni au transport ni à la mutation.
 * `images` reste donc à part, et `tentativeId` avec elle : l'identifiant
 * d'une tentative de revendication n'est pas un fait du Produit, et
 * `ProductInput` n'a aucun champ où le loger.
 */
export interface SoumissionFormulaireProduit {
  /** Les champs du Catalogue — son entrée, hors galerie : faite d'URL, pas d'entrées. */
  champsCatalogue: Omit<ProductInput, "images">
  /** La galerie telle que le formulaire l'a soumise. */
  images: EntreeImageProduit[]
  /** L'identifiant de tentative des Brouillons d'Image produit. */
  tentativeId: string
}

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
      throw new Error(MESSAGE_SPECIFICATIONS_INVALIDE)
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

/**
 * Le `FormData` soumis devient une soumission lue : le format du câble du
 * formulaire Produit en un seul endroit, lisible d'un trait.
 *
 * **Ce que lit cette fonction, et nulle part ailleurs :**
 *
 * - `name`, `slug`, `brand`, `categoryId` (champ caché) et `description`,
 *   lus en texte, une valeur absente valant la chaîne vide ;
 * - `price`, le prix de base : une **chaîne décimale** de dirhams, lue par
 *   l'aide d'argent partagée et rendue en centimes ; un prix qu'elle ne sait
 *   pas lire est refusé (`MESSAGE_FORMULAIRE_INVALIDE`) ;
 * - `specsText`, le langage ligne à ligne des Spécifications, par
 *   `specificationsDepuisTexte` — dont le refus est inchangé ;
 * - `isFeatured` et `freeShipping`, les deux cases à cocher, selon la
 *   convention du module de rendu : un champ caché qui vaut `"on"` quand la
 *   case est cochée et `""` quand elle ne l'est pas. Seule la chaîne `"on"`
 *   est vraie : `"true"`, `"1"` et un champ absent valent `false` ;
 * - `featuredOrder`, le champ d'ordre : un nombre, et **zéro** si la valeur
 *   n'en est pas un. Une valeur négative ou fractionnaire traverse telle
 *   quelle — c'est le `productInputSchema` du Catalogue qui la refuse ;
 * - `images`, le champ caché de la galerie : du JSON, **`galerieImageProduitSchema`
 *   compris** ;
 * - `variants`, le champ caché des Variantes : du JSON relu par un `JSON.parse`
 *   **seul, sans validation** ; le `productInputSchema` de la mutation juge
 *   chaque Variante en aval, et le valider ici changerait le comportement
 *   observable d'une soumission ;
 * - `tentativeId`, l'identifiant de tentative des Brouillons d'Image produit :
 *   la chaîne rognée, telle quelle. Un champ absent ou seulement blanc donne
 *   une chaîne vide — le transport ne fabrique pas d'identité à la place de
 *   celle qu'il ne trouve pas, et c'est le refus que le cycle de vie des Images
 *   produit définit déjà qui juge ensuite une identité vide. Le champ caché
 *   `productId` **n'est pas** lu ici : l'identification du Produit édité
 *   reste l'affaire de `parseRequiredId`, dans l'action.
 *
 * Un champ caché absent est lu comme une liste vide (`[]`) : c'est le
 * comportement d'aujourd'hui, et le formulaire envoie toujours les deux.
 *
 * Les refus possibles sont donc : un champ caché illisible, une galerie qui
 * n'en est pas une, un prix de base illisible — tous les trois
 * `MESSAGE_FORMULAIRE_INVALIDE` — et une ligne de Spécifications sans
 * deux-points, dont le message est propre au langage du champ. Toutes ces
 * levée sont des `Error` simples, parce qu'elles se produisent pendant la
 * lecture de la soumission et que l'enveloppe de mutation partagée transforme
 * alors n'importe quelle levée en `{ error: <message> }`.
 */
export function soumissionDepuisFormData(
  formData: FormData
): SoumissionFormulaireProduit {
  const imagesBrut = formData.get("images")
  const variantesBrut = formData.get("variants")
  const tentativeBrut = formData.get("tentativeId")

  let images: EntreeImageProduit[]
  let variantes: ProductInput["variants"]
  try {
    images = galerieImageProduitSchema.parse(
      JSON.parse(String(imagesBrut ?? "[]"))
    )
    // Pas de zod ici, et c'est délibéré : voir la note sur `variants`.
    variantes = JSON.parse(String(variantesBrut ?? "[]"))
  } catch {
    throw new Error(MESSAGE_FORMULAIRE_INVALIDE)
  }

  const prix = parseMadToCents(String(formData.get("price") ?? ""))
  if (prix === null) throw new Error(MESSAGE_FORMULAIRE_INVALIDE)

  return {
    champsCatalogue: {
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      brand: String(formData.get("brand") ?? ""),
      categoryId: String(formData.get("categoryId") ?? ""),
      description: String(formData.get("description") ?? ""),
      price: prix,
      isFeatured: formData.get("isFeatured") === "on",
      featuredOrder: Number(formData.get("featuredOrder") ?? 0) || 0,
      freeShipping: formData.get("freeShipping") === "on",
      specs: specificationsDepuisTexte(String(formData.get("specsText") ?? "")),
      variants: variantes,
    },
    images,
    tentativeId: typeof tentativeBrut === "string" ? tentativeBrut.trim() : "",
  }
}
