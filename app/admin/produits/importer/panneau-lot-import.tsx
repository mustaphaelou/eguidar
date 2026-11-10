import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  LIBELLES_STATUT_LIGNE_IMPORT,
  LIBELLES_STATUT_LOT_IMPORT,
  MESSAGE_APPLIQUER_LOT_NON_VERIFIE,
  MESSAGE_APPLIQUER_PRET,
  MESSAGE_APPLIQUER_REFUS,
  grouperParProduit,
  messageDAvertissement,
  messageDuRefus,
  type AvertissementImport,
} from "@/lib/import-produits"
import { formatPrice } from "@/lib/money"
import type {
  ChampPlanImport,
  ChangementPlanImport,
  DiffProduitPlanImport,
} from "@/lib/plan-import-produits"
import type { MutationFormAction } from "@/lib/use-cases/mutation-actions"
import type {
  LigneImportLue,
  LotImportLu,
} from "@/lib/use-cases/import-produits"
import type { VerificationState } from "./actions"
import { BoutonVerifierLot } from "./bouton-verifier-lot"

const NOMBRE = new Intl.NumberFormat("fr-MA")
const DATE = new Intl.DateTimeFormat("fr-MA", {
  dateStyle: "long",
  timeStyle: "short",
})

const LIBELLES_CHAMPS: Readonly<Record<ChampPlanImport, string>> =
  Object.freeze({
    name: "Nom",
    brand: "Marque",
    description: "Description",
    category: "Structure",
    price: "Prix",
    stock: "Stock",
  })

function tailleEnOctets(taille: number): string {
  return `${NOMBRE.format(taille)} octet${taille > 1 ? "s" : ""}`
}

function avertissementDepuisLeCode(code: string): AvertissementImport | null {
  switch (code) {
    case "description_html":
      return { code: "description_html" }
    case "produit_sans_structure":
      return { code: "produit_sans_structure" }
    case "nom_ressemblant":
      return { code: "nom_ressemblant" }
    default:
      return null
  }
}

function avertissementsDeLaLigne(ligne: LigneImportLue): AvertissementImport[] {
  return ligne.avertissements
    .map((code) => avertissementDepuisLeCode(code))
    .filter((avertissement) => avertissement !== null)
}

function avertissementsDuGroupe(
  lignes: readonly LigneImportLue[]
): AvertissementImport[] {
  const vus = new Set<string>()
  return lignes
    .flatMap((ligne) => avertissementsDeLaLigne(ligne))
    .filter((avertissement) => {
      if (vus.has(avertissement.code)) return false
      vus.add(avertissement.code)
      return true
    })
}

function valeurAffichee(
  changement: ChangementPlanImport,
  valeur: string | number | null
): string {
  if (valeur === null) return "—"
  if (changement.champ === "price" && typeof valeur === "number") {
    return formatPrice(valeur)
  }
  return String(valeur)
}

function Changements({
  changements,
}: {
  changements: readonly ChangementPlanImport[]
}) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {changements.map((changement) => (
        <li
          key={changement.champ}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
        >
          <span className="font-medium">
            {LIBELLES_CHAMPS[changement.champ]}
          </span>
          <span className="text-muted-foreground">
            {`Avant : ${valeurAffichee(changement, changement.avant)}`}
          </span>
          <span aria-hidden="true">→</span>
          <span>{`Après : ${valeurAffichee(changement, changement.apres)}`}</span>
        </li>
      ))}
    </ul>
  )
}

function DiffDuProduit({ diff }: { diff: DiffProduitPlanImport | null }) {
  if (diff === null) return null
  if (diff.produit.length === 0 && diff.variantes.length === 0) return null

  return (
    <section
      aria-label="Changements du Produit"
      className="flex flex-col gap-3 rounded-xl bg-muted/40 p-3"
    >
      <h4 className="text-sm font-medium">Changements</h4>
      {diff.produit.length > 0 ? (
        <Changements changements={diff.produit} />
      ) : null}
      {diff.variantes.map((variante) => (
        <div key={variante.sku} className="flex flex-col gap-1">
          <h5 className="text-sm">
            Variante <code className="text-xs">{variante.sku}</code>
          </h5>
          <Changements changements={variante.changements} />
        </div>
      ))}
    </section>
  )
}

function LigneLue({ ligne }: { ligne: LigneImportLue }) {
  return (
    <li className="flex flex-col gap-1 rounded-xl bg-muted/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{`Ligne ${ligne.numero}`}</span>
        <code className="text-xs">
          {ligne.sku === "" ? "sku vide" : ligne.sku}
        </code>
        {ligne.statut !== null ? (
          <Badge
            variant={ligne.statut === "refusee" ? "destructive" : "secondary"}
          >
            {LIBELLES_STATUT_LIGNE_IMPORT[ligne.statut]}
          </Badge>
        ) : null}
      </div>
      {ligne.refus !== null ? (
        <div className="flex flex-col gap-1">
          <p className="text-destructive">{messageDuRefus(ligne.refus)}</p>
          <code className="text-xs text-muted-foreground">
            {ligne.refus.code}
          </code>
        </div>
      ) : null}
    </li>
  )
}

function GroupeDeLignes({
  slug,
  lignes,
}: {
  slug: string
  lignes: readonly LigneImportLue[]
}) {
  const refus = lignes.find((ligne) => ligne.refus !== null)?.refus ?? null
  const avertissements = avertissementsDuGroupe(lignes)
  const diff = lignes.find((ligne) => ligne.diff !== null)?.diff ?? null

  return (
    <section
      aria-label={slug === "" ? "Lignes illisibles" : `Produit ${slug}`}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">
          {slug === "" ? (
            "Lignes illisibles"
          ) : (
            <>
              Produit <code>{slug}</code>
            </>
          )}
        </h3>
        {refus !== null && slug !== "" ? (
          <code className="text-xs text-muted-foreground">{refus.code}</code>
        ) : null}
      </div>

      {avertissements.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-muted-foreground">
          {avertissements.map((avertissement) => (
            <li key={avertissement.code}>
              {messageDAvertissement(avertissement)}
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="flex flex-col gap-2">
        {lignes.map((ligne) => (
          <LigneLue key={ligne.id} ligne={ligne} />
        ))}
      </ul>

      <DiffDuProduit diff={diff} />
    </section>
  )
}

function Compteurs({ lot }: { lot: LotImportLu }) {
  return (
    <section
      aria-label="Compteurs de la Vérification"
      className="flex flex-col gap-2"
    >
      <h2 className="font-medium">Résultat de la Vérification</h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Produits créés</dt>
          <dd className="text-lg font-medium">{lot.produitsCrees}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Produits modifiés</dt>
          <dd className="text-lg font-medium">{lot.produitsModifies}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Produits inchangés</dt>
          <dd className="text-lg font-medium">{lot.produitsInchanges}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Produits refusés</dt>
          <dd className="text-lg font-medium">{lot.produitsRefuses}</dd>
        </div>
      </dl>
    </section>
  )
}

/**
 * Le Lot relu : son statut, son auteur, son instant, l'empreinte et la taille de
 * son fichier, ses avertissements, le résultat de sa Vérification — compteurs,
 * statuts de Ligne, refus avec numéro et code, avertissements et diff avant →
 * après — et l'état du bouton Appliquer. Appliquer reste indisponible tant que
 * le Lot n'est pas vérifié, ou qu'une seule Ligne ou un seul Produit est refusé.
 */
export function PanneauLotImport({
  lot,
  verificationAction,
}: {
  lot: LotImportLu
  verificationAction: MutationFormAction<VerificationState>
}) {
  const refuse = lot.statut === "echoue"
  const verifie = lot.statut === "verifie"
  const groupes = grouperParProduit(lot.lignes)
  const nombreDeLignes = lot.lignes.length
  const libelleLignes = `${NOMBRE.format(nombreDeLignes)} ligne${
    nombreDeLignes > 1 ? "s" : ""
  } lue${nombreDeLignes > 1 ? "s" : ""}`
  const refusPresent = lot.lignes.some(
    (ligne) => ligne.statut === "refusee" || ligne.refus !== null
  )
  const appliquerDisponible =
    verifie && !refusPresent && lot.produitsRefuses === 0
  const messageAppliquer = !verifie
    ? MESSAGE_APPLIQUER_LOT_NON_VERIFIE
    : refusPresent || lot.produitsRefuses > 0
      ? MESSAGE_APPLIQUER_REFUS
      : MESSAGE_APPLIQUER_PRET

  return (
    <Card aria-label="Lot d'import">
      <CardHeader>
        <CardTitle>Lot d&apos;import</CardTitle>
        <CardAction>
          <Badge variant={refuse ? "destructive" : "secondary"}>
            {LIBELLES_STATUT_LOT_IMPORT[lot.statut]}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {lot.motifEchec ? (
          <p
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {lot.motifEchec}
          </p>
        ) : null}

        <p className="text-sm text-muted-foreground">
          {refuse
            ? "Le fichier a été refusé : aucun Produit, aucune Variante et aucune Structure n'ont été écrits. Corrigez le fichier, puis téléversez-le de nouveau."
            : verifie
              ? "Le fichier est accepté et le Lot est vérifié : voici ce que son application créerait, modifierait ou refuserait, sans rien écrire."
              : "Le fichier est accepté. Ses Lignes sont lues ; la Vérification contre le Catalogue dira ce qu'il créerait, modifierait ou refuserait."}
        </p>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Auteur</dt>
            <dd>
              {lot.auteur
                ? `${lot.auteur.name} (${lot.auteur.email})`
                : "Auteur inconnu"}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Téléversé le</dt>
            <dd>{DATE.format(lot.createdAt)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Taille du fichier</dt>
            <dd>{tailleEnOctets(lot.taille)}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">Empreinte SHA-256</dt>
            <dd>
              <code className="text-xs break-all">{lot.empreinte}</code>
            </dd>
          </div>
        </dl>

        {lot.avertissements.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="font-medium">Avertissements du fichier</h2>
            <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-muted-foreground">
              {lot.avertissements.map((avertissement, index) => (
                <li key={`${index}-${avertissement}`}>{avertissement}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {refuse ? null : (
          <section className="flex flex-col gap-4">
            {verifie ? <Compteurs lot={lot} /> : null}

            <BoutonVerifierLot lotId={lot.id} action={verificationAction} />

            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">Lignes lues</h2>
                <span className="text-sm text-muted-foreground">
                  {libelleLignes}
                </span>
              </div>

              {groupes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ce fichier ne contient aucune Ligne de données.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {groupes.map((groupe) => (
                    <GroupeDeLignes
                      key={
                        groupe.slug === "" ? "lignes-illisibles" : groupe.slug
                      }
                      slug={groupe.slug}
                      lignes={groupe.lignes}
                    />
                  ))}
                </div>
              )}
            </section>

            <div className="flex flex-col gap-2 border-t border-foreground/10 pt-4">
              <div>
                <Button type="button" disabled={!appliquerDisponible}>
                  Appliquer le Lot
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {messageAppliquer}
              </p>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  )
}
