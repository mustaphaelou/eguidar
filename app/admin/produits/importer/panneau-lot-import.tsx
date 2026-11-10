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
  MESSAGE_INDEXATION_EN_ATTENTE,
  avertissementDepuisLeCode,
  estDejaApplique,
  estEnApplication,
  grouperParProduit,
  statutAfficheDuLot,
  messageDAvertissement,
  messageDuRefus,
  peutAppliquer,
  peutVerifier,
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
import type { ApplicationState, VerificationState } from "./actions"
import { BoutonAppliquerLot } from "./bouton-appliquer-lot"
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

function avertissementsDeLaLigne(ligne: LigneImportLue): AvertissementImport[] {
  return ligne.avertissements.flatMap((code) => {
    const avertissement = avertissementDepuisLeCode(code)
    return avertissement === null ? [] : [avertissement]
  })
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
            variant={
              ligne.statut === "refusee" || ligne.statut === "echouee"
                ? "destructive"
                : "secondary"
            }
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
      {ligne.motifEchec !== null ? (
        <p className="text-destructive">
          {`Échec d'écriture : ${ligne.motifEchec}`}
        </p>
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

/**
 * Le CSV des refus se télécharge depuis la base, pas depuis le fichier
 * d'origine : les cellules de chaque Ligne refusée y sont persistées.
 */
function TelechargerLesRefus({ lotId }: { lotId: string }) {
  return (
    <div>
      <Button
        variant="outline"
        render={
          <a href={`/api/admin/produits/importer/refus/${lotId}`} download />
        }
      >
        Télécharger le CSV des refus
      </Button>
    </div>
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
 * Le rapport de l'application : ce qui est **écrit** et ce qui est **indexé**
 * sont deux compteurs distincts. Tant que l'indexation est en retard, le Lot
 * reste « en cours » et le rapport dit « indexation en attente », jamais
 * « terminé ».
 */
function CompteursApplication({ lot }: { lot: LotImportLu }) {
  const indexationEnAttente = lot.indexes < lot.ecrits
  const termineEtIndexe = lot.statut === "termine" && !indexationEnAttente
  const totalProduits = grouperParProduit(lot.lignes).filter(
    (groupe) => groupe.slug !== ""
  ).length

  return (
    <section
      aria-label="Résultat de l'application"
      className="flex flex-col gap-2"
    >
      <h2 className="font-medium">Résultat de l&apos;application</h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Produits écrits</dt>
          <dd className="text-lg font-medium">{lot.ecrits}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Produits indexés</dt>
          <dd className="text-lg font-medium">{lot.indexes}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Produits traités</dt>
          <dd className="text-lg font-medium">
            {`${lot.curseur} / ${totalProduits}`}
          </dd>
        </div>
      </dl>
      {indexationEnAttente ? (
        <p
          role="status"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
        >
          {MESSAGE_INDEXATION_EN_ATTENTE}
        </p>
      ) : null}
      {lot.statut === "partiel" ? (
        <p className="text-sm text-destructive">
          L&apos;application est partielle : les Produits en échec ont leur
          raison sur leurs Lignes. Corrigez le fichier, puis téléversez-le de
          nouveau.
        </p>
      ) : null}
      {termineEtIndexe ? (
        <p className="text-sm text-muted-foreground">
          Le Lot est terminé : tous ses Produits sont écrits et indexés.
        </p>
      ) : null}
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
  applicationAction,
}: {
  lot: LotImportLu
  verificationAction: MutationFormAction<VerificationState>
  applicationAction: MutationFormAction<ApplicationState>
}) {
  const refuse = lot.statut === "echoue"
  const verifie = lot.statut === "verifie"
  const enCours = estEnApplication(lot.statut)
  const partiel = lot.statut === "partiel"
  const termine = lot.statut === "termine"
  const dejaApplique = estDejaApplique(lot.statut)
  const peutVerifierLeLot = peutVerifier(lot.statut)
  const peutAppliquerLeLot = peutAppliquer(lot.statut)
  const groupes = grouperParProduit(lot.lignes)
  const totalProduits = groupes.filter((groupe) => groupe.slug !== "").length
  const nombreDeLignes = lot.lignes.length
  const libelleLignes = `${NOMBRE.format(nombreDeLignes)} ligne${
    nombreDeLignes > 1 ? "s" : ""
  } lue${nombreDeLignes > 1 ? "s" : ""}`
  const refusPresent = lot.lignes.some(
    (ligne) => ligne.statut === "refusee" || ligne.refus !== null
  )
  // L'indexation est un effet après commit : tant qu'elle n'a pas rattrapé les
  // écritures, le rapport ne dit jamais « terminé », quel que soit le statut
  // persisté.
  const indexationEnAttente = lot.indexes < lot.ecrits
  const applicationCommencee =
    enCours || dejaApplique || lot.ecrits > 0 || lot.indexes > 0
  const appliquerDisponible =
    peutAppliquerLeLot && !refusPresent && lot.produitsRefuses === 0
  const messageAppliquer = dejaApplique
    ? termine
      ? "Ce Lot est déjà appliqué : ses Produits sont écrits et son rapport est ci-dessus."
      : "Ce Lot a été appliqué partiellement : les Produits en échec portent leur raison. Corrigez le fichier, puis téléversez-le de nouveau."
    : enCours
      ? "L'application est en cours : reprenez-la pour écrire les Produits restants et rattraper l'indexation."
      : !peutAppliquerLeLot
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
            {LIBELLES_STATUT_LOT_IMPORT[statutAfficheDuLot(lot)]}
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
            : termine
              ? indexationEnAttente
                ? "Le Lot est en cours d'application : les Produits déjà écrits le restent, l'indexation est en attente et sera reprise automatiquement."
                : "Le Lot est terminé : ses Produits sont écrits et indexés."
              : partiel
                ? "Le Lot a été appliqué partiellement : les Produits écrits le sont, les autres ont leur raison sur leurs Lignes."
                : enCours
                  ? "Le Lot est en cours d'application : les Produits déjà écrits le restent, l'application reprend au curseur."
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

        {refusPresent ? <TelechargerLesRefus lotId={lot.id} /> : null}

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
            {verifie || enCours || dejaApplique ? (
              <Compteurs lot={lot} />
            ) : null}
            {applicationCommencee ? <CompteursApplication lot={lot} /> : null}

            {peutVerifierLeLot ? (
              <BoutonVerifierLot lotId={lot.id} action={verificationAction} />
            ) : null}

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
              {appliquerDisponible ? (
                <BoutonAppliquerLot
                  lotId={lot.id}
                  curseurInitial={lot.curseur}
                  ecritsInitiaux={lot.ecrits}
                  indexesInitiaux={lot.indexes}
                  total={totalProduits}
                  reprise={enCours}
                  action={applicationAction}
                />
              ) : (
                <div>
                  <Button type="button" disabled>
                    Appliquer le Lot
                  </Button>
                </div>
              )}
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
