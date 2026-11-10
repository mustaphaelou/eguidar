/**
 * Le contrat du fichier d'import des Produits. Le module n'importe rien : il
 * porte les neuf colonnes, la lecture stricte de l'UTF-8, le jugement de
 * l'en-tête, le vocabulaire fermé des refus et des avertissements, leurs
 * messages français, et le modèle vierge. Il est partagé par le serveur et le
 * client, sans base, sans horloge et sans réseau.
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

export type CodeRefusImport =
  "fichier_trop_gros" | "encodage_invalide" | "en_tete_incomplet"

export interface RefusImport {
  code: CodeRefusImport
  /** Les colonnes requises absentes, pour `en_tete_incomplet`. */
  colonnes?: readonly ColonneRequiseImport[]
}

export type CodeAvertissementImport = "colonne_inconnue"

export interface AvertissementImport {
  code: CodeAvertissementImport
  /** La colonne du fichier qui est ignorée. */
  colonne: string
  /** La colonne connue dont `colonne` ne diffère que par la casse ou l'accent. */
  colonneAttendue?: ColonneImport
}

export interface EnTeteImport {
  /** Les cellules non vides de l'en-tête, dans l'ordre du fichier. */
  colonnes: readonly string[]
  avertissements: readonly AvertissementImport[]
  refus: readonly RefusImport[]
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
  }
}

/** Le modèle vierge : une seule ligne d'en-tête, BOM compris pour Excel. */
export function contenuDuModele(): string {
  return `\uFEFF${COLONNES_IMPORT.join(",")}\r\n`
}
