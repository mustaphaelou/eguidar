/**
 * Le contrat du fichier d'import des Produits. Le module n'importe rien : il
 * porte les neuf colonnes, la lecture stricte de l'UTF-8, le jugement de
 * l'en-tête, le parseur RFC 4180 minimal, la normalisation et le groupement des
 * Lignes, le vocabulaire fermé des refus et des avertissements, leurs messages
 * français, et le modèle vierge. Il est partagé par le serveur et le client,
 * sans base, sans horloge et sans réseau.
 */

export const COLONNES_IMPORT = [
  "slug",
  "name",
  "brand",
  "category",
  "description",
  "variant_sku",
  "variant_name",
  "variant_price",
  "variant_stock",
] as const

export type ColonneImport = (typeof COLONNES_IMPORT)[number]

export const COLONNES_REQUISES_IMPORT = ["slug", "variant_sku"] as const

export type ColonneRequiseImport = (typeof COLONNES_REQUISES_IMPORT)[number]

/** 5 Mo : le contrat du fichier, sous la limite de corps de 6 Mo des actions. */
export const LIMITE_OCTETS_IMPORT = 5 * 1024 * 1024

export const NOM_MODELE_IMPORT = "modele-import-produits.csv"

export const STATUTS_LOT_IMPORT = [
  "brouillon",
  "verifie",
  "en_cours",
  "partiel",
  "termine",
  "echoue",
] as const

export type StatutLotImport = (typeof STATUTS_LOT_IMPORT)[number]

export const LIBELLES_STATUT_LOT_IMPORT: Readonly<
  Record<StatutLotImport, string>
> = Object.freeze({
  brouillon: "Brouillon",
  verifie: "Vérifié",
  en_cours: "En cours",
  partiel: "Partiel",
  termine: "Terminé",
  echoue: "Échoué",
})

export const STATUTS_LIGNE_IMPORT = [
  "a_creer",
  "a_modifier",
  "inchangee",
  "refusee",
  "ecrite",
  "echouee",
] as const

export type StatutLigneImport = (typeof STATUTS_LIGNE_IMPORT)[number]

export const LIBELLES_STATUT_LIGNE_IMPORT: Readonly<
  Record<StatutLigneImport, string>
> = Object.freeze({
  a_creer: "À créer",
  a_modifier: "À modifier",
  inchangee: "Inchangée",
  refusee: "Refusée",
  ecrite: "Écrite",
  echouee: "Échouée",
})

export const CODES_REFUS_IMPORT = [
  "fichier_trop_gros",
  "encodage_invalide",
  "en_tete_incomplet",
  "ligne_mal_formee",
  "slug_invalide",
  "champ_requis_manquant",
  "prix_invalide",
  "stock_invalide",
  "doublon_fichier",
  "produit_en_conflit",
] as const

export type CodeRefusImport = (typeof CODES_REFUS_IMPORT)[number]

/** Reconnaît un code de refus relu depuis la base. */
export function estCodeRefusImport(valeur: string): valeur is CodeRefusImport {
  return (CODES_REFUS_IMPORT as readonly string[]).includes(valeur)
}

export interface RefusImport {
  code: CodeRefusImport
  /** Les colonnes requises absentes, pour `en_tete_incomplet`. */
  colonnes?: readonly ColonneRequiseImport[]
  /** Le champ fautif, pour `champ_requis_manquant` et `produit_en_conflit`. */
  champ?: ColonneImport
  /** La valeur fautive, pour `slug_invalide`. */
  slug?: string
  /** Le sku concerné, pour `doublon_fichier`. */
  sku?: string
  /** La forme du doublon, pour que le message dise laquelle des deux. */
  doublon?: "sku" | "couple"
}

export type CodeAvertissementImport = "colonne_inconnue" | "description_html"

export type AvertissementImport =
  | {
      code: "colonne_inconnue"
      /** La colonne du fichier qui est ignorée. */
      colonne: string
      /** La colonne connue dont `colonne` ne diffère que par la casse ou l'accent. */
      colonneAttendue?: ColonneImport
    }
  | { code: "description_html" }

export interface EnTeteImport {
  /** Les cellules non vides de l'en-tête, dans l'ordre du fichier. */
  colonnes: readonly string[]
  avertissements: readonly AvertissementImport[]
  refus: readonly RefusImport[]
}

/** Les valeurs brutes des colonnes connues présentes dans l'en-tête. */
export type CellulesImport = Readonly<Partial<Record<ColonneImport, string>>>

/** L'enregistrement normalisé d'une Ligne : une cellule absente vaut `null`. */
export interface EnregistrementImport {
  produit: {
    slug: string | null
    name: string | null
    brand: string | null
    category: string | null
    description: string | null
  }
  variante: {
    sku: string | null
    name: string | null
    /** Le prix en centimes, l'unité de la base. */
    prix: number | null
    stock: number | null
  }
}

/** Une Ligne d'import lue : ses cellules brutes et son enregistrement normalisé. */
export interface LigneImport {
  /** Le numéro de la ligne physique du fichier où l'enregistrement commence. */
  numero: number
  slug: string
  sku: string
  cellules: CellulesImport
  enregistrement: EnregistrementImport | null
  refus: RefusImport | null
  avertissements: readonly AvertissementImport[]
}

/**
 * Décode les octets en UTF-8 strict. Rend `null` dès qu'une séquence est
 * invalide ; un BOM initial est retiré et les fins de ligne CRLF restent
 * intactes.
 */
export function lireLeTexte(octets: Uint8Array): string | null {
  try {
    const texte = new TextDecoder("utf-8", { fatal: true }).decode(octets)
    return texte.startsWith("\uFEFF") ? texte.slice(1) : texte
  } catch {
    return null
  }
}

function premiereLigne(texte: string): string {
  const fin = texte.search(/\r?\n/)
  return fin === -1 ? texte : texte.slice(0, fin)
}

/**
 * Découpe une ligne d'en-tête sur les virgules, en retirant les guillemets
 * d'une cellule citée. Le parseur RFC 4180 complet appartient à la lecture
 * des Lignes ; l'en-tête n'a ni retour à la ligne cité ni cellule multi-ligne.
 */
function cellulesDEnTete(ligne: string): string[] {
  const cellules: string[] = []
  let courante = ""
  let entreGuillemets = false

  for (let index = 0; index < ligne.length; index += 1) {
    const caractere = ligne[index]!

    if (entreGuillemets) {
      if (caractere === '"') {
        if (ligne[index + 1] === '"') {
          courante += '"'
          index += 1
        } else {
          entreGuillemets = false
        }
      } else {
        courante += caractere
      }
      continue
    }

    if (caractere === '"' && courante.trim() === "") {
      courante = ""
      entreGuillemets = true
    } else if (caractere === ",") {
      cellules.push(courante.trim())
      courante = ""
    } else {
      courante += caractere
    }
  }

  cellules.push(courante.trim())
  return cellules.filter((cellule) => cellule.length > 0)
}

function sansCasseNiAccent(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function colonneConnue(nom: string): ColonneImport | undefined {
  const normalise = sansCasseNiAccent(nom)
  return COLONNES_IMPORT.find(
    (colonne) => sansCasseNiAccent(colonne) === normalise
  )
}

function estColonneConnue(nom: string): nom is ColonneImport {
  return (COLONNES_IMPORT as readonly string[]).includes(nom)
}

/**
 * Juge l'en-tête seul : les colonnes présentes, les colonnes inconnues en
 * avertissement, et les colonnes requises absentes en refus. Un en-tête
 * refusé n'empêche pas de rendre les avertissements déjà observés.
 */
export function jugerLEnTete(texte: string): EnTeteImport {
  const colonnes = cellulesDEnTete(premiereLigne(texte))
  const avertissements: AvertissementImport[] = []

  for (const colonne of colonnes) {
    if (estColonneConnue(colonne)) continue
    const attendue = colonneConnue(colonne)
    avertissements.push(
      attendue === undefined
        ? { code: "colonne_inconnue", colonne }
        : { code: "colonne_inconnue", colonne, colonneAttendue: attendue }
    )
  }

  const manquantes = COLONNES_REQUISES_IMPORT.filter(
    (requise) => !colonnes.includes(requise)
  )

  return {
    colonnes,
    avertissements,
    refus:
      manquantes.length === 0
        ? []
        : [{ code: "en_tete_incomplet", colonnes: manquantes }],
  }
}

interface EnregistrementBrut {
  numero: number
  cellules: string[]
  malFormee: boolean
}

/**
 * Découpe le texte en enregistrements selon un RFC 4180 minimal : virgule,
 * guillemets, `""` échappé, retours à la ligne cités, LF ou CRLF. Le numéro
 * d'un enregistrement est celui de la ligne physique où il commence ; un
 * retour à la ligne cité ne renumérote pas les enregistrements suivants.
 */
function analyserLesEnregistrements(texte: string): EnregistrementBrut[] {
  const source = texte.startsWith("\uFEFF") ? texte.slice(1) : texte
  const enregistrements: EnregistrementBrut[] = []
  let index = 0
  let numeroLigne = 1

  while (index < source.length) {
    const numeroDebut = numeroLigne
    const cellules: string[] = []
    let courante = ""
    let enGuillemets = false
    let guillemetFerme = false
    let malFormee = false

    while (index < source.length) {
      const caractere = source[index]!

      if (enGuillemets) {
        if (caractere === '"') {
          if (source[index + 1] === '"') {
            courante += '"'
            index += 2
          } else {
            enGuillemets = false
            guillemetFerme = true
            index += 1
          }
          continue
        }
        if (caractere === "\r" && source[index + 1] === "\n") {
          courante += "\r\n"
          index += 2
          numeroLigne += 1
          continue
        }
        if (caractere === "\n") {
          courante += "\n"
          index += 1
          numeroLigne += 1
          continue
        }
        courante += caractere
        index += 1
        continue
      }

      if (caractere === ",") {
        cellules.push(courante.trim())
        courante = ""
        guillemetFerme = false
        index += 1
        continue
      }

      if (caractere === "\r" && source[index + 1] === "\n") {
        index += 2
        numeroLigne += 1
        break
      }
      if (caractere === "\n") {
        index += 1
        numeroLigne += 1
        break
      }

      if (caractere === '"') {
        if (courante.trim() === "" && !guillemetFerme) {
          courante = ""
          enGuillemets = true
        } else {
          malFormee = true
        }
        index += 1
        continue
      }

      if (guillemetFerme) {
        if (!/\s/.test(caractere)) malFormee = true
        index += 1
        continue
      }

      courante += caractere
      index += 1
    }

    if (enGuillemets) malFormee = true

    cellules.push(courante.trim())
    enregistrements.push({ numero: numeroDebut, cellules, malFormee })
  }

  return enregistrements
}

function enregistrementVide(cellules: readonly string[]): boolean {
  return cellules.every((cellule) => cellule.length === 0)
}

const GRAMMAIRE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FORMAT_PRIX = /^\d+(?:\.\d{1,2})?$/
const FORMAT_STOCK = /^\d+$/

function valeurPresente(
  cellules: CellulesImport,
  colonne: ColonneImport
): string | null {
  const valeur = cellules[colonne]
  return valeur === undefined || valeur === "" ? null : valeur
}

/** Lit un prix en dirhams et le rend en centimes, sans passer par un flottant. */
function lireLePrix(valeur: string): number | null {
  if (!FORMAT_PRIX.test(valeur)) return null

  const [dirhams = "", centimes = ""] = valeur.split(".")
  const prix = Number(dirhams) * 100 + Number(centimes.padEnd(2, "0"))
  return Number.isSafeInteger(prix) ? prix : null
}

function lireLeStock(valeur: string): number | null {
  if (!FORMAT_STOCK.test(valeur)) return null

  const stock = Number(valeur)
  return Number.isSafeInteger(stock) ? stock : null
}

function normaliserLaLigne(cellules: CellulesImport): EnregistrementImport {
  const prix = valeurPresente(cellules, "variant_price")
  const stock = valeurPresente(cellules, "variant_stock")

  return {
    produit: {
      slug: valeurPresente(cellules, "slug"),
      name: valeurPresente(cellules, "name"),
      brand: valeurPresente(cellules, "brand"),
      category: valeurPresente(cellules, "category"),
      description: valeurPresente(cellules, "description"),
    },
    variante: {
      sku: valeurPresente(cellules, "variant_sku"),
      name: valeurPresente(cellules, "variant_name"),
      prix: prix === null ? null : lireLePrix(prix),
      stock: stock === null ? null : lireLeStock(stock),
    },
  }
}

/** Le premier refus local de la Ligne, dans l'ordre de priorité documenté. */
function refuserLaLigne(cellules: CellulesImport): RefusImport | null {
  const slug = cellules.slug ?? ""
  if (!GRAMMAIRE_SLUG.test(slug)) return { code: "slug_invalide", slug }

  if ((cellules.variant_sku ?? "") === "") {
    return { code: "champ_requis_manquant", champ: "variant_sku" }
  }

  const prix = valeurPresente(cellules, "variant_price")
  if (prix !== null && lireLePrix(prix) === null) {
    return { code: "prix_invalide" }
  }

  const stock = valeurPresente(cellules, "variant_stock")
  if (stock !== null && lireLeStock(stock) === null) {
    return { code: "stock_invalide" }
  }

  return null
}

const CHAMPS_PRODUIT = ["name", "brand", "category", "description"] as const

const BALISE_HTML = /<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/i

/**
 * Reconnaît une balise HTML dans un texte, pour avertir sans jamais refuser :
 * la description d'un Produit s'affiche comme du texte, balises comprises.
 */
export function ressembleÀDuHtml(texte: string): boolean {
  return BALISE_HTML.test(texte)
}

interface DoublonDeLigne {
  doublon: "sku" | "couple"
  sku: string
  slug: string
}

function doublonsDesLignes(
  lignes: readonly LigneImport[]
): ReadonlyMap<number, DoublonDeLigne> {
  const parSku = new Map<string, LigneImport[]>()
  const parCouple = new Map<string, LigneImport[]>()

  for (const ligne of lignes) {
    if (ligne.refus?.code === "ligne_mal_formee" || ligne.sku === "") continue

    const occurrencesSku = parSku.get(ligne.sku) ?? []
    occurrencesSku.push(ligne)
    parSku.set(ligne.sku, occurrencesSku)

    const couple = `${ligne.slug}\u0000${ligne.sku}`
    const occurrencesCouple = parCouple.get(couple) ?? []
    occurrencesCouple.push(ligne)
    parCouple.set(couple, occurrencesCouple)
  }

  const doublons = new Map<number, DoublonDeLigne>()
  for (const [sku, occurrences] of parSku) {
    if (occurrences.length < 2) continue
    for (const ligne of occurrences) {
      const couple = `${ligne.slug}\u0000${sku}`
      doublons.set(ligne.numero, {
        doublon: (parCouple.get(couple)?.length ?? 0) > 1 ? "couple" : "sku",
        sku,
        slug: ligne.slug,
      })
    }
  }
  return doublons
}

function conflitsDesProduits(
  lignes: readonly LigneImport[]
): ReadonlyMap<string, ColonneImport> {
  const parSlug = new Map<string, LigneImport[]>()
  for (const ligne of lignes) {
    if (ligne.refus?.code === "ligne_mal_formee") continue
    if (!GRAMMAIRE_SLUG.test(ligne.slug)) continue

    const occurrences = parSlug.get(ligne.slug) ?? []
    occurrences.push(ligne)
    parSlug.set(ligne.slug, occurrences)
  }

  const conflits = new Map<string, ColonneImport>()
  for (const [slug, occurrences] of parSlug) {
    for (const champ of CHAMPS_PRODUIT) {
      const valeurs = new Set(
        occurrences
          .map((ligne) => ligne.cellules[champ] ?? "")
          .filter((valeur) => valeur !== "")
      )
      if (valeurs.size > 1) {
        conflits.set(slug, champ)
        break
      }
    }
  }
  return conflits
}

export interface GroupeProduit<T> {
  slug: string
  lignes: readonly T[]
}

/** Groupe les Lignes par slug, dans l'ordre de première apparition. */
export function grouperParProduit<T extends { slug: string }>(
  lignes: readonly T[]
): readonly GroupeProduit<T>[] {
  const groupes = new Map<string, T[]>()
  for (const ligne of lignes) {
    const groupe = groupes.get(ligne.slug)
    if (groupe === undefined) groupes.set(ligne.slug, [ligne])
    else groupe.push(ligne)
  }
  return [...groupes].map(([slug, lignesDuGroupe]) => ({
    slug,
    lignes: lignesDuGroupe,
  }))
}

/**
 * Lit le tableau des Lignes d'un fichier déjà accepté : chaque enregistrement
 * devient une Ligne numérotée, les cellules sont rangées par nom de colonne,
 * une Ligne mal formée est refusée sans empêcher la lecture des autres, puis
 * les doublons et les conflits de Produit sont refusés sur toutes leurs
 * occurrences. Une Ligne ne porte jamais qu'un refus, dans l'ordre de priorité
 * `ligne_mal_formee` > `slug_invalide` > `champ_requis_manquant` >
 * `prix_invalide` > `stock_invalide` > `doublon_fichier` > `produit_en_conflit`.
 */
export function lireLesLignes(texte: string): readonly LigneImport[] {
  const enregistrements = analyserLesEnregistrements(texte)
  const entete = enregistrements[0]
  if (entete === undefined || entete.malFormee) return []

  const indexParColonne = new Map<ColonneImport, number>()
  for (const [index, nom] of entete.cellules.entries()) {
    if (estColonneConnue(nom) && !indexParColonne.has(nom)) {
      indexParColonne.set(nom, index)
    }
  }

  const lignes: LigneImport[] = []
  for (const enregistrement of enregistrements.slice(1)) {
    if (enregistrementVide(enregistrement.cellules)) continue

    const malFormee =
      enregistrement.malFormee ||
      enregistrement.cellules.length !== entete.cellules.length

    const cellules: Record<string, string> = {}
    if (!malFormee) {
      for (const [colonne, index] of indexParColonne) {
        cellules[colonne] = enregistrement.cellules[index] ?? ""
      }
    }

    const description = cellules.description ?? ""
    const avertissements: AvertissementImport[] =
      !malFormee && description !== "" && ressembleÀDuHtml(description)
        ? [{ code: "description_html" }]
        : []

    lignes.push({
      numero: enregistrement.numero,
      slug: cellules.slug ?? "",
      sku: cellules.variant_sku ?? "",
      cellules,
      enregistrement: malFormee ? null : normaliserLaLigne(cellules),
      refus: malFormee
        ? { code: "ligne_mal_formee" }
        : refuserLaLigne(cellules),
      avertissements,
    })
  }

  const doublons = doublonsDesLignes(lignes)
  for (const ligne of lignes) {
    const doublon = doublons.get(ligne.numero)
    if (ligne.refus === null && doublon !== undefined) {
      ligne.refus = { code: "doublon_fichier", ...doublon }
    }
  }

  const conflits = conflitsDesProduits(lignes)
  for (const ligne of lignes) {
    const champ = conflits.get(ligne.slug)
    if (ligne.refus === null && champ !== undefined) {
      ligne.refus = { code: "produit_en_conflit", champ }
    }
  }

  return lignes
}

function listeFrancaise(elements: readonly string[]): string {
  if (elements.length <= 1) return elements[0] ?? ""
  return `${elements.slice(0, -1).join(", ")} et ${elements[elements.length - 1]}`
}

function messageEnTeteIncomplet(
  colonnes: readonly ColonneRequiseImport[]
): string {
  if (colonnes.length === 1) {
    return `L'en-tête ne contient pas la colonne requise « ${colonnes[0]} ».`
  }
  return `L'en-tête ne contient pas les colonnes requises ${listeFrancaise(
    colonnes.map((colonne) => `« ${colonne} »`)
  )}.`
}

/** Le message français d'un refus : un seul propriétaire du texte. */
export function messageDuRefus(refus: RefusImport): string {
  switch (refus.code) {
    case "fichier_trop_gros":
      return "Le fichier dépasse 5 Mo. Découpez-le en plusieurs fichiers plus petits, puis téléversez-les l'un après l'autre."
    case "encodage_invalide":
      return "Le fichier n'est pas en UTF-8. Enregistrez-le en UTF-8, puis réessayez : les accents doivent rester lisibles."
    case "en_tete_incomplet":
      return messageEnTeteIncomplet(refus.colonnes ?? [])
    case "ligne_mal_formee":
      return "La Ligne n'est pas un enregistrement CSV valide : un guillemet n'est pas fermé, ou son nombre de cellules diffère de l'en-tête."
    case "slug_invalide":
      if (refus.slug === undefined || refus.slug === "") {
        return "Le slug de la Ligne est vide ou invalide : il doit être en minuscules, en chiffres et en tirets uniquement, par exemple « chaise-longue »."
      }
      return `Le slug « ${refus.slug} » est invalide : il doit être en minuscules, en chiffres et en tirets uniquement, par exemple « chaise-longue ».`
    case "champ_requis_manquant":
      if (refus.champ === undefined) {
        return "Un champ requis de la Ligne est vide."
      }
      return `La colonne requise « ${refus.champ} » est vide sur cette Ligne.`
    case "prix_invalide":
      return "Le prix de la Variante n'est pas un montant valide : écrivez des dirhams avec un point décimal et deux décimales au plus, par exemple « 12.50 »."
    case "stock_invalide":
      return "Le stock de la Variante n'est pas un entier positif ou nul : écrivez un nombre entier, par exemple « 3 »."
    case "doublon_fichier": {
      const sku = refus.sku ?? "cette Variante"
      if (refus.doublon === "couple") {
        return `Le couple du slug « ${refus.slug ?? ""} » et du sku « ${sku} » apparaît plusieurs fois dans le fichier : toutes ses occurrences sont refusées.`
      }
      if (refus.slug !== undefined && refus.slug !== "") {
        return `Le sku « ${sku} » du Produit « ${refus.slug} » apparaît plusieurs fois dans le fichier : toutes ses occurrences sont refusées.`
      }
      return `Le sku « ${sku} » apparaît plusieurs fois dans le fichier : toutes ses occurrences sont refusées.`
    }
    case "produit_en_conflit":
      if (refus.champ === undefined) {
        return "Deux Lignes du même Produit donnent des valeurs différentes pour un même champ : le Produit entier est refusé."
      }
      return `Deux Lignes du même Produit donnent des valeurs différentes pour le champ « ${refus.champ} » : le Produit entier est refusé.`
  }
}

/** Le message français d'un avertissement, jamais bloquant. */
export function messageDAvertissement(
  avertissement: AvertissementImport
): string {
  switch (avertissement.code) {
    case "colonne_inconnue":
      if (avertissement.colonneAttendue !== undefined) {
        return `La colonne « ${avertissement.colonne} » est ignorée : les noms de colonnes sont sensibles à la casse et aux accents. La colonne attendue est « ${avertissement.colonneAttendue} ».`
      }
      return `La colonne « ${avertissement.colonne} » est ignorée : elle ne fait pas partie des neuf colonnes attendues.`
    case "description_html":
      return "La description ressemble à du HTML : elle s'affichera comme du texte brut, balises comprises."
  }
}

/** Le modèle vierge : une seule ligne d'en-tête, BOM compris pour Excel. */
export function contenuDuModele(): string {
  return `\uFEFF${COLONNES_IMPORT.join(",")}\r\n`
}
