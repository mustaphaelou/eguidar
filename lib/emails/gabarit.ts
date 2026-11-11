import { html, type HtmlSûr } from "@/lib/emails/html"
import { etapeDe, ETAPES } from "@/lib/emails/etapes"
import {
  COULEUR_ACCENT,
  COULEUR_BLANC,
  COULEUR_FILET,
  COULEUR_FOND,
  COULEUR_NOIR,
  COULEUR_TEXTE,
  COULEUR_TEXTE_ATTÉNUÉ,
  LARGEUR_LETTRE,
  MOT_SYMBOLE,
  PILE_DE_POLICES,
  PILE_DE_POLICES_MONO,
} from "@/lib/emails/marque"
import { piedLettre, urlAbsolue } from "@/lib/emails/pied"
import { site } from "@/lib/site"
import type { OrderStatus } from "@/lib/statut-de-commande"

export interface LigneDeLettre {
  label: string
  value: string
  kind?: "detail" | "total"
  tone?: "offered" | "muted"
  note?: string
}

export type Bloc =
  | { type: "titre"; texte: string }
  | { type: "paragraphe"; texte: string }
  | { type: "lignes"; lignes: readonly LigneDeLettre[] }
  | { type: "encart"; titre?: string; texte?: string }
  | { type: "bouton"; libellé: string; url: string }
  | { type: "etapes"; statut: OrderStatus }
  | { type: "code"; code: string }

export interface Lettre {
  préEnTête: string
  noteEnTête?: string
  blocs: readonly Bloc[]
}

function blocTitre(texte: string): HtmlSûr {
  return html`<h1
    class="eguidar-titre"
    style="margin: 0 0 18px; font-family: ${PILE_DE_POLICES}; font-size: 34px; line-height: 40px; font-weight: 600; letter-spacing: -0.025em; color: ${COULEUR_TEXTE};"
  >
    ${texte}
  </h1>`
}

function blocParagraphe(texte: string): HtmlSûr {
  return html`<p
    style="margin: 0 0 28px; font-family: ${PILE_DE_POLICES}; font-size: 18px; line-height: 28px; color: ${COULEUR_TEXTE};"
  >
    ${texte}
  </p>`
}

function couleurValeur(ligne: LigneDeLettre): string {
  if (ligne.tone === "offered") return COULEUR_ACCENT
  if (ligne.tone === "muted") return COULEUR_TEXTE_ATTÉNUÉ
  return COULEUR_TEXTE
}

function styleValeurLigne(ligne: LigneDeLettre): string {
  const taille =
    ligne.kind === "total" ? "font-size: 17px;" : "font-size: 16px;"
  const poids = ligne.kind === "total" ? "font-weight: 600;" : ""
  return `${taille} ${poids} text-align: right; vertical-align: top; font-variant-numeric: tabular-nums; color: ${couleurValeur(ligne)};`
}

function styleTableLignes(options: {
  ouvreLeGroupe?: boolean
  fermeLeGroupe?: boolean
}): string {
  return [
    "width: 100%",
    options.fermeLeGroupe === false ? "margin: 0" : "margin: 0 0 24px",
    "border-collapse: collapse",
    options.ouvreLeGroupe === false
      ? ""
      : `border-top: 1px solid ${COULEUR_FILET}`,
    `border-bottom: 1px solid ${COULEUR_FILET}`,
  ]
    .filter((declaration) => declaration !== "")
    .join("; ")
}

function blocLignes(
  lignes: readonly LigneDeLettre[],
  options: { ouvreLeGroupe?: boolean; fermeLeGroupe?: boolean } = {}
): HtmlSûr {
  if (lignes.length === 0) return html``
  const lignesRendues = lignes.map((ligne, index) => {
    const dernier = index === lignes.length - 1
    const total = ligne.kind === "total"
    const suivantTotal = lignes[index + 1]?.kind === "total"
    const filetBas =
      dernier || suivantTotal
        ? ""
        : `border-bottom: 1px solid ${COULEUR_FILET};`
    const filetHaut = total ? `border-top: 1px solid ${COULEUR_TEXTE};` : ""
    const rembourrage = total ? "16px 0" : "14px 0"
    const poidsLibellé = total ? "600" : ligne.note ? "500" : "400"
    return html`<tr>
      <td
        style="${filetBas} ${filetHaut} padding: ${rembourrage}; font-family: ${PILE_DE_POLICES}; font-size: 16px; line-height: 24px; vertical-align: top; color: ${COULEUR_TEXTE};"
      >
        <span style="font-weight: ${poidsLibellé};">${ligne.label}</span>
        ${
          ligne.note
            ? html`<span
                style="display: block; margin-top: 2px; font-size: 13px; line-height: 19px; font-weight: 400; color: ${COULEUR_TEXTE_ATTÉNUÉ};"
                >${ligne.note}</span
              >`
            : html``
        }
      </td>
      <td
        style="${filetBas} ${filetHaut} ${styleValeurLigne(ligne)} padding: ${rembourrage}; font-family: ${PILE_DE_POLICES}; line-height: 24px;"
      >
        ${ligne.value}
      </td>
    </tr>`
  })
  return html`<table
    role="presentation"
    cellpadding="0"
    cellspacing="0"
    style="${styleTableLignes(options)};"
  >
    <tbody>
      ${lignesRendues}
    </tbody>
  </table>`
}

function blocEncart(encart: { titre?: string; texte?: string }): HtmlSûr {
  if (!encart.titre && !encart.texte) return html``
  return html`<table
    role="presentation"
    cellpadding="0"
    cellspacing="0"
    width="100%"
    style="width: 100%; margin: 0 0 24px; border-collapse: collapse;"
  >
    <tbody>
      <tr>
        <td
          style="padding: 18px 20px; border-radius: 14px; background: ${COULEUR_FOND}; font-family: ${PILE_DE_POLICES};"
        >
          ${
            encart.titre
              ? html`<p
                  style="margin: 0 0 3px; font-size: 15px; line-height: 22px; font-weight: 600; color: ${COULEUR_TEXTE};"
                >
                  ${encart.titre}
                </p>`
              : html``
          }
          ${
            encart.texte
              ? html`<p
                  style="margin: 0; font-size: 15px; line-height: 23px; color: ${COULEUR_TEXTE};"
                >
                  ${encart.texte}
                </p>`
              : html``
          }
        </td>
      </tr>
    </tbody>
  </table>`
}

function blocBouton(bouton: { libellé: string; url: string }): HtmlSûr {
  return html`<div style="margin: 32px 0 4px;">
    <a
      href="${bouton.url}"
      class="eguidar-bouton"
      style="display: inline-block; padding: 14px 28px; border-radius: 980px; background: ${COULEUR_ACCENT}; color: ${COULEUR_BLANC}; font-family: ${PILE_DE_POLICES}; font-size: 15px; line-height: 20px; font-weight: 600; letter-spacing: -0.01em; text-decoration: none;"
      >${bouton.libellé}</a
    >
  </div>`
}

function blocEtapes(statut: OrderStatus): HtmlSûr {
  const étape = etapeDe(statut)
  if (étape === "arrêté") return html``
  const cellules = ETAPES.map((libellé, index) => {
    const numéro = index + 1
    const atteinte = numéro === étape
    const franchie = numéro < étape
    const couleurFilet = atteinte || franchie ? COULEUR_ACCENT : COULEUR_FILET
    const couleurTexte = atteinte ? COULEUR_TEXTE : COULEUR_TEXTE_ATTÉNUÉ
    const poids = atteinte ? " font-weight: 600;" : ""
    return html`<td
      ${atteinte ? html`aria-current="step"` : html``}
      class="eguidar-etape"
      style="width: 25%; padding: 14px 6px 0 0; border-top: 2px solid ${couleurFilet}; vertical-align: top; text-align: left; font-family: ${PILE_DE_POLICES}; font-size: 11px; line-height: 16px; letter-spacing: 0.06em; text-transform: uppercase; color: ${couleurTexte};${poids}"
    >
      ${libellé}
    </td>`
  })
  return html`<table
    role="presentation"
    cellpadding="0"
    cellspacing="0"
    class="eguidar-etapes"
    style="width: 100%; margin: 4px 0 30px; border-collapse: collapse; table-layout: fixed;"
  >
    <tbody>
      <tr>
        ${cellules}
      </tr>
    </tbody>
  </table>`
}

function blocCode(code: string): HtmlSûr {
  return html`<div
    style="margin: 0 0 24px; padding: 22px 12px; border-radius: 14px; background: ${COULEUR_FOND}; text-align: center; font-family: ${PILE_DE_POLICES_MONO}; font-size: 38px; line-height: 46px; font-weight: 600; letter-spacing: 10px; color: ${COULEUR_TEXTE};"
  >
    ${code}
  </div>`
}

/**
 * Les tableaux de lignes qui se suivent se lisent comme un seul : le premier
 * ouvre le filet, les suivants s'y raccordent sans gouttière, le dernier porte
 * l'écart. Le récapitulatif garde ainsi la forme d'une seule table.
 */
function rendreBlocs(blocs: readonly Bloc[]): HtmlSûr {
  return html`${blocs.map((bloc, index) => {
    if (bloc.type !== "lignes") return rendreBloc(bloc)
    return blocLignes(bloc.lignes, {
      ouvreLeGroupe: blocs[index - 1]?.type !== "lignes",
      fermeLeGroupe: blocs[index + 1]?.type !== "lignes",
    })
  })}`
}

function rendreBloc(bloc: Bloc): HtmlSûr {
  switch (bloc.type) {
    case "titre":
      return blocTitre(bloc.texte)
    case "paragraphe":
      return blocParagraphe(bloc.texte)
    case "lignes":
      return blocLignes(bloc.lignes)
    case "encart":
      return blocEncart(bloc)
    case "bouton":
      return blocBouton(bloc)
    case "etapes":
      return blocEtapes(bloc.statut)
    case "code":
      return blocCode(bloc.code)
  }
}

function enteteLettre(noteEnTête: string): HtmlSûr {
  return html`<table
    role="presentation"
    cellpadding="0"
    cellspacing="0"
    width="100%"
    bgcolor="${COULEUR_NOIR}"
    style="width: 100%; border-collapse: collapse; background: ${COULEUR_NOIR};"
  >
    <tbody>
      <tr>
        <td align="center" style="padding: 0;">
          <table
            role="presentation"
            cellpadding="0"
            cellspacing="0"
            width="${LARGEUR_LETTRE}"
            class="eguidar-contenu"
            style="width: 100%; max-width: ${LARGEUR_LETTRE}; border-collapse: collapse;"
          >
            <tbody>
              <tr>
                <td
                  class="eguidar-entete"
                  height="140"
                  style="height: 140px; padding: 0 48px; vertical-align: middle;"
                >
                  <table
                    role="presentation"
                    cellpadding="0"
                    cellspacing="0"
                    width="100%"
                    style="width: 100%; border-collapse: collapse;"
                  >
                    <tbody>
                      <tr>
                        <td
                          align="left"
                          style="font-family: ${PILE_DE_POLICES}; font-size: 28px; line-height: 28px; font-weight: 600; letter-spacing: -0.035em; color: ${COULEUR_BLANC};"
                        >
                          <a
                            href="${urlAbsolue("/")}"
                            style="color: ${COULEUR_BLANC}; text-decoration: none;"
                            >${MOT_SYMBOLE}</a
                          >
                        </td>
                        ${
                          noteEnTête
                            ? html`<td
                                align="right"
                                style="font-family: ${PILE_DE_POLICES}; font-size: 10px; line-height: 14px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255, 255, 255, 0.56);"
                              >
                                ${noteEnTête}
                              </td>`
                            : html``
                        }
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>`
}

export function rendreLettre(lettre: Lettre): string {
  const blocTitreLettre = lettre.blocs.find((bloc) => bloc.type === "titre")
  const titre =
    blocTitreLettre?.type === "titre" ? blocTitreLettre.texte : lettre.préEnTête
  const préEnTête =
    lettre.préEnTête.trim() !== ""
      ? lettre.préEnTête
      : titre.trim() !== ""
        ? titre
        : site.legalName
  const noteEnTête = lettre.noteEnTête?.trim() ?? ""

  return html`<!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <title>${titre}</title>
        <style>
          @media only screen and (max-width: 600px) {
            .eguidar-entete {
              height: 104px !important;
              padding-left: 24px !important;
              padding-right: 24px !important;
            }
            .eguidar-corps {
              padding-left: 24px !important;
              padding-right: 24px !important;
              padding-top: 34px !important;
            }
            .eguidar-titre {
              font-size: 28px !important;
              line-height: 34px !important;
            }
            .eguidar-pied {
              padding-left: 24px !important;
              padding-right: 24px !important;
            }
            .eguidar-etape {
              padding-right: 4px !important;
              font-size: 10px !important;
              letter-spacing: 0.04em !important;
            }
            .eguidar-bouton {
              display: block !important;
              box-sizing: border-box !important;
              text-align: center !important;
            }
          }
        </style>
      </head>
      <body
        style="margin: 0; padding: 0; background: ${COULEUR_BLANC}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;"
      >
        <div
          style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; font-size: 1px;"
        >
          ${préEnTête}
        </div>
        ${enteteLettre(noteEnTête)}
        <table
          role="presentation"
          cellpadding="0"
          cellspacing="0"
          width="100%"
          bgcolor="${COULEUR_BLANC}"
          style="width: 100%; border-collapse: collapse; background: ${COULEUR_BLANC};"
        >
          <tbody>
            <tr>
              <td align="center" style="padding: 0;">
                <table
                  role="presentation"
                  cellpadding="0"
                  cellspacing="0"
                  width="${LARGEUR_LETTRE}"
                  class="eguidar-contenu"
                  style="width: 100%; max-width: ${LARGEUR_LETTRE}; border-collapse: collapse;"
                >
                  <tbody>
                    <tr>
                      <td
                        class="eguidar-corps"
                        style="padding: 52px 48px 40px; font-family: ${PILE_DE_POLICES};"
                      >
                        ${rendreBlocs(lettre.blocs)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
        ${piedLettre()}
      </body>
    </html>`.html
}
