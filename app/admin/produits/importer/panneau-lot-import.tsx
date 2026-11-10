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
  LIBELLES_STATUT_LOT_IMPORT,
  estCodeRefusImport,
  grouperParProduit,
  messageDAvertissement,
  messageDuRefus,
} from "@/lib/import-produits"
import type {
  LigneImportLue,
  LotImportLu,
} from "@/lib/use-cases/import-produits"

const NOMBRE = new Intl.NumberFormat("fr-MA")
const DATE = new Intl.DateTimeFormat("fr-MA", {
  dateStyle: "long",
  timeStyle: "short",
})

function tailleEnOctets(taille: number): string {
  return `${NOMBRE.format(taille)} octet${taille > 1 ? "s" : ""}`
}

function messageDeLaLigne(ligne: LigneImportLue): string | null {
  if (ligne.codeRefus === null || !estCodeRefusImport(ligne.codeRefus)) {
    return null
  }
  return messageDuRefus({
    code: ligne.codeRefus,
    slug: ligne.slug,
    sku: ligne.sku,
  })
}

function messagesDesAvertissements(ligne: LigneImportLue): string[] {
  return ligne.avertissements
    .filter((code) => code === "description_html")
    .map(() => messageDAvertissement({ code: "description_html" }))
}

function LigneLue({ ligne }: { ligne: LigneImportLue }) {
  const refus = messageDeLaLigne(ligne)
  const avertissements = messagesDesAvertissements(ligne)

  return (
    <li className="flex flex-col gap-1 rounded-xl bg-muted/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{`Ligne ${ligne.numero}`}</span>
        <code className="text-xs">
          {ligne.sku === "" ? "sku vide" : ligne.sku}
        </code>
        {ligne.statut === "refusee" ? (
          <Badge variant="destructive">Refusée</Badge>
        ) : null}
      </div>
      {refus !== null ? <p className="text-destructive">{refus}</p> : null}
      {avertissements.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 ps-5 text-muted-foreground">
          {avertissements.map((avertissement) => (
            <li key={avertissement}>{avertissement}</li>
          ))}
        </ul>
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
  return (
    <section
      aria-label={slug === "" ? "Lignes illisibles" : `Produit ${slug}`}
      className="flex flex-col gap-2"
    >
      <h3 className="text-sm font-medium">
        {slug === "" ? (
          "Lignes illisibles"
        ) : (
          <>
            Produit <code>{slug}</code>
          </>
        )}
      </h3>
      <ul className="flex flex-col gap-2">
        {lignes.map((ligne) => (
          <LigneLue key={ligne.id} ligne={ligne} />
        ))}
      </ul>
    </section>
  )
}

/**
 * Le Lot relu après un téléversement : son statut, son auteur, son instant,
 * l'empreinte de son fichier, sa taille, ses avertissements et les Lignes
 * lues, groupées par Produit. À ce ticket le Lot reste `brouillon` : la
 * Vérification et l'application des Lignes arrivent avec les tickets suivants,
 * et le bouton Appliquer reste indisponible tant que le Lot n'est pas vérifié.
 */
export function PanneauLotImport({ lot }: { lot: LotImportLu }) {
  const refuse = lot.statut === "echoue"
  const groupes = grouperParProduit(lot.lignes)
  const nombreDeLignes = lot.lignes.length
  const libelleLignes = `${NOMBRE.format(nombreDeLignes)} ligne${
    nombreDeLignes > 1 ? "s" : ""
  } lue${nombreDeLignes > 1 ? "s" : ""}`

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
            : "Le fichier est accepté. Ses Lignes sont lues et prêtes ; la Vérification contre le Catalogue sera disponible à l'étape suivante."}
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
            <h2 className="font-medium">Avertissements</h2>
            <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-muted-foreground">
              {lot.avertissements.map((avertissement, index) => (
                <li key={`${index}-${avertissement}`}>{avertissement}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {refuse ? null : (
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
                    key={groupe.slug}
                    slug={groupe.slug}
                    lignes={groupe.lignes}
                  />
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-foreground/10 pt-4">
              <div>
                <Button type="button" disabled={lot.statut !== "verifie"}>
                  Appliquer le Lot
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {lot.statut === "verifie"
                  ? "Le Lot est vérifié : son application écrira les Produits annoncés, sans rien supprimer."
                  : "Appliquer reste indisponible tant que le Lot n'est pas vérifié : la Vérification du Lot doit d'abord être terminée."}
              </p>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  )
}
