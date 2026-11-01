"use client"

import {
  Copy01Icon,
  GridViewIcon,
  Image01Icon,
  ListViewIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Image from "next/image"
import Link from "next/link"
import { useActionState, useMemo, useState } from "react"

import { EmptyState } from "@/components/admin/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LONGUEUR_MAX_TEXTE_ALTERNATIF } from "@/lib/galerie-image-produit"
import {
  MEDIAS_LISTING_PATH,
  buildMediasListingUrl,
  type MediasListingParams,
} from "@/lib/medias-listing"
import { cn } from "@/lib/utils"
import type {
  FaitsImageProduit,
  PageImagesProduit,
} from "@/lib/use-cases/images-produit"

export interface MediasActionState {
  error?: string
}

export type MediasAction = (
  prevState: MediasActionState,
  formData: FormData
) => Promise<MediasActionState>

interface MediasBibliothequeProps {
  params: MediasListingParams
  page: PageImagesProduit
  supprimerImages: MediasAction
  mettreAJourAlt: MediasAction
  reconcilier: MediasAction
}

function dimensions(image: FaitsImageProduit): string {
  return image.width > 0 && image.height > 0
    ? `${image.width} × ${image.height} px`
    : "Dimensions inconnues"
}

export function formatTaille(octets: number): string {
  if (!Number.isFinite(octets) || octets <= 0) return "Taille inconnue"
  if (octets < 1024) return `${octets} o`
  const ko = octets / 1024
  if (ko < 1024) return `${ko.toFixed(1).replace(".", ",")} Ko`
  return `${(ko / 1024).toFixed(1).replace(".", ",")} Mo`
}

function pluriel(nombre: number, singulier: string, pluriel: string): string {
  return `${nombre} ${nombre > 1 ? pluriel : singulier}`
}

function usageLabel(image: FaitsImageProduit): string {
  if (image.usageCount === 0) return "Inutilisée"
  return `Utilisée par ${image.usageCount} Produit(s) : ${image.produits
    .map((produit) => produit.name)
    .join(", ")}`
}

export function MediasBibliotheque({
  params,
  page,
  supprimerImages,
  mettreAJourAlt,
  reconcilier,
}: MediasBibliothequeProps) {
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set())
  const [detailUrl, setDetailUrl] = useState<string | null>(null)
  const [vue, setVue] = useState<"grille" | "liste">("grille")
  const [copie, setCopie] = useState<string | null>(null)
  const [suppression, supprimerAction, suppressionEnCours] = useActionState(
    supprimerImages,
    {}
  )
  const [altState, altAction, altEnCours] = useActionState(mettreAJourAlt, {})
  const [reconciliation, reconcilierAction, reconciliationEnCours] =
    useActionState(reconcilier, {})

  const selectionEffective = useMemo(() => {
    const presentes = new Set(page.images.map((image) => image.publicUrl))
    return new Set([...selection].filter((url) => presentes.has(url)))
  }, [page.images, selection])

  const detail =
    page.images.find((image) => image.publicUrl === detailUrl) ?? null
  const filtresActifs = Boolean(
    params.q || params.inutilisees || params.sansAlt
  )

  function basculer(publicUrl: string) {
    setSelection((courante) => {
      const suivante = new Set(courante)
      if (suivante.has(publicUrl)) suivante.delete(publicUrl)
      else suivante.add(publicUrl)
      return suivante
    })
  }

  async function copier(publicUrl: string) {
    setCopie(null)
    try {
      if (!navigator.clipboard) throw new Error("Presse-papiers indisponible")
      await navigator.clipboard.writeText(publicUrl)
      setCopie("Adresse copiée")
    } catch {
      setCopie("La copie de l'adresse a échoué")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        method="get"
        action={MEDIAS_LISTING_PATH}
        role="search"
        className="flex flex-wrap items-center gap-2"
      >
        <div className="relative w-full max-w-md">
          <Label htmlFor="medias-q" className="sr-only">
            Rechercher une Image produit
          </Label>
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground"
          />
          <Input
            id="medias-q"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Texte alternatif, adresse ou Produit…"
            className="h-9 ps-9"
          />
        </div>
        {params.inutilisees ? (
          <input type="hidden" name="inutilisees" value="1" />
        ) : null}
        {params.sansAlt ? (
          <input type="hidden" name="sans-alt" value="1" />
        ) : null}
        <Button type="submit" variant="outline" size="sm" className="h-9">
          Rechercher
        </Button>
        {filtresActifs ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            render={<Link href={buildMediasListingUrl({})} />}
          >
            Réinitialiser
          </Button>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={params.inutilisees ? "secondary" : "outline"}
          size="sm"
          className="h-9"
          aria-pressed={params.inutilisees ?? false}
          render={
            <Link
              href={buildMediasListingUrl({
                ...params,
                inutilisees: params.inutilisees ? undefined : true,
              })}
            />
          }
        >
          Inutilisées ({page.inutiliseesCount})
        </Button>
        <Button
          variant={params.sansAlt ? "secondary" : "outline"}
          size="sm"
          className="h-9"
          aria-pressed={params.sansAlt ?? false}
          render={
            <Link
              href={buildMediasListingUrl({
                ...params,
                sansAlt: params.sansAlt ? undefined : true,
              })}
            />
          }
        >
          Sans texte alternatif ({page.sansAltCount})
        </Button>
        <form action={reconcilierAction} className="flex items-center gap-2">
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="h-9"
            disabled={reconciliationEnCours}
          >
            {reconciliationEnCours
              ? "Réconciliation…"
              : "Réconcilier le registre"}
          </Button>
          {reconciliation.error ? (
            <p role="alert" className="text-sm text-destructive">
              {reconciliation.error}
            </p>
          ) : null}
        </form>
        <div
          role="group"
          aria-label="Affichage de la bibliothèque"
          className="ms-auto inline-flex items-center rounded-full border bg-muted/50 p-0.5"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={vue === "grille"}
            onClick={() => setVue("grille")}
            className={cn(
              "h-8 rounded-full px-3",
              vue === "grille" && "bg-background shadow-sm ring-1 ring-border"
            )}
          >
            <HugeiconsIcon icon={GridViewIcon} strokeWidth={2} />
            Grille
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={vue === "liste"}
            onClick={() => setVue("liste")}
            className={cn(
              "h-8 rounded-full px-3",
              vue === "liste" && "bg-background shadow-sm ring-1 ring-border"
            )}
          >
            <HugeiconsIcon icon={ListViewIcon} strokeWidth={2} />
            Liste
          </Button>
        </div>
      </div>

      <p
        role="status"
        aria-live="polite"
        className="text-sm text-muted-foreground"
      >
        {pluriel(
          page.images.length,
          "Image produit affichée",
          "Images produit affichées"
        )}{" "}
        sur {page.totalCount} au registre ·{" "}
        {pluriel(page.inutiliseesCount, "inutilisée", "inutilisées")} ·{" "}
        {page.sansAltCount} sans texte alternatif
        {selectionEffective.size > 0
          ? ` · ${pluriel(selectionEffective.size, "sélectionnée", "sélectionnées")}`
          : ""}
      </p>

      {selectionEffective.size > 0 ? (
        <form
          action={supprimerAction}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2"
        >
          {[...selectionEffective].map((publicUrl) => (
            <input
              key={publicUrl}
              type="hidden"
              name="publicUrl"
              value={publicUrl}
            />
          ))}
          <span className="text-sm font-medium">
            {pluriel(selectionEffective.size, "sélectionnée", "sélectionnées")}
          </span>
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={suppressionEnCours}
          >
            {suppressionEnCours ? "Suppression…" : "Supprimer la sélection"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelection(new Set())}
          >
            Tout désélectionner
          </Button>
          {suppression.error ? (
            <p role="alert" className="w-full text-sm text-destructive">
              {suppression.error}
            </p>
          ) : null}
        </form>
      ) : null}

      {page.images.length === 0 ? (
        <EmptyState
          icon={
            <HugeiconsIcon
              icon={Image01Icon}
              strokeWidth={2}
              className="size-5"
            />
          }
          title={
            filtresActifs
              ? "Aucune Image produit ne correspond à ces critères."
              : "La bibliothèque est vide."
          }
          description={
            filtresActifs
              ? "Effacez les filtres pour revoir toutes les images du catalogue."
              : "Les images téléversées depuis les Produits apparaîtront ici."
          }
          action={
            filtresActifs ? (
              <Button
                variant="outline"
                render={<Link href={buildMediasListingUrl({})} />}
              >
                Effacer les filtres
              </Button>
            ) : null
          }
          className="py-14"
        />
      ) : vue === "grille" ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {page.images.map((image) => (
            <li
              key={image.publicUrl}
              data-image-url={image.publicUrl}
              className="group flex flex-col overflow-clip rounded-xl border bg-card"
            >
              <div className="relative aspect-square bg-muted/30">
                <button
                  type="button"
                  onClick={() => setDetailUrl(image.publicUrl)}
                  className="block size-full"
                  aria-label="Ouvrir le détail de l'Image produit"
                >
                  <Image
                    src={image.publicUrl}
                    alt={image.alt ?? ""}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-[1.03]"
                  />
                </button>
                <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
                  <span className="pointer-events-auto rounded-full bg-background/90 p-1 shadow-sm backdrop-blur">
                    <Checkbox
                      checked={selectionEffective.has(image.publicUrl)}
                      onCheckedChange={() => basculer(image.publicUrl)}
                      aria-label={`Sélectionner l'Image produit ${
                        image.alt ?? image.publicUrl
                      }`}
                    />
                  </span>
                  <Badge
                    variant={image.usageCount > 0 ? "secondary" : "outline"}
                    className="bg-background/90 shadow-sm backdrop-blur"
                  >
                    {image.usageCount > 0
                      ? `Utilisée (${image.usageCount})`
                      : "Inutilisée"}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-col gap-1 p-3">
                <p className="line-clamp-2 text-xs font-medium">
                  {image.alt ?? (
                    <span className="text-destructive">
                      Sans texte alternatif
                    </span>
                  )}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {dimensions(image)} · {formatTaille(image.byteSize)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-clip rounded-xl border bg-card">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Sélection</TableHead>
                <TableHead>Image produit</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">
                  Dimensions
                </TableHead>
                <TableHead className="hidden lg:table-cell">Taille</TableHead>
                <TableHead>Utilisation</TableHead>
                <TableHead className="hidden md:table-cell">
                  Texte alternatif
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.images.map((image) => (
                <TableRow
                  key={image.publicUrl}
                  data-image-url={image.publicUrl}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectionEffective.has(image.publicUrl)}
                      onCheckedChange={() => basculer(image.publicUrl)}
                      aria-label={`Sélectionner l'Image produit ${
                        image.alt ?? image.publicUrl
                      }`}
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setDetailUrl(image.publicUrl)}
                      className="flex items-center gap-2 text-start"
                      aria-label="Ouvrir le détail de l'Image produit"
                    >
                      <Image
                        src={image.publicUrl}
                        alt=""
                        width={96}
                        height={96}
                        sizes="96px"
                        className="size-12 rounded-lg border object-cover"
                      />
                      <span className="max-w-48 truncate">
                        {image.publicUrl}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {image.mimeType}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {dimensions(image)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {formatTaille(image.byteSize)}
                  </TableCell>
                  <TableCell>{usageLabel(image)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {image.alt ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Drawer
        open={detail !== null}
        onOpenChange={(ouvert) => {
          if (!ouvert) setDetailUrl(null)
        }}
        swipeDirection="right"
      >
        <DrawerContent>
          {detail ? (
            <>
              <DrawerHeader className="flex-row items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <DrawerTitle>Détail de l&apos;Image produit</DrawerTitle>
                  <DrawerDescription className="break-all">
                    {detail.publicUrl}
                  </DrawerDescription>
                </div>
                <DrawerClose
                  render={<Button type="button" variant="outline" size="sm" />}
                >
                  Fermer
                </DrawerClose>
              </DrawerHeader>
              <div className="flex flex-col gap-4 overflow-y-auto p-4">
                <Image
                  src={detail.publicUrl}
                  alt={detail.alt ?? ""}
                  width={320}
                  height={320}
                  sizes="320px"
                  className="w-full rounded-xl border object-contain"
                />
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Dimensions</dt>
                  <dd>{dimensions(detail)}</dd>
                  <dt className="text-muted-foreground">Taille</dt>
                  <dd>{formatTaille(detail.byteSize)}</dd>
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{detail.mimeType}</dd>
                  <dt className="text-muted-foreground">Utilisations</dt>
                  <dd>{usageLabel(detail)}</dd>
                </dl>
                <form action={altAction} className="flex flex-col gap-2">
                  <input
                    type="hidden"
                    name="publicUrl"
                    value={detail.publicUrl}
                  />
                  <Label htmlFor="alt-detail">Texte alternatif</Label>
                  <Input
                    id="alt-detail"
                    name="alt"
                    defaultValue={detail.alt ?? ""}
                    maxLength={LONGUEUR_MAX_TEXTE_ALTERNATIF}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    className="w-fit"
                    disabled={altEnCours}
                  >
                    {altEnCours
                      ? "Enregistrement…"
                      : "Enregistrer le texte alternatif"}
                  </Button>
                  {altState.error ? (
                    <p role="alert" className="text-sm text-destructive">
                      {altState.error}
                    </p>
                  ) : null}
                </form>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copier(detail.publicUrl)}
                  >
                    <HugeiconsIcon
                      icon={Copy01Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    Copier l&apos;adresse
                  </Button>
                  <form action={supprimerAction}>
                    <input
                      type="hidden"
                      name="publicUrl"
                      value={detail.publicUrl}
                    />
                    <Button
                      type="submit"
                      variant="destructive"
                      size="sm"
                      disabled={suppressionEnCours}
                    >
                      Supprimer cette Image produit
                    </Button>
                  </form>
                </div>
                {copie ? (
                  <p role="status" className="text-sm">
                    {copie}
                  </p>
                ) : null}
                {suppression.error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {suppression.error}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </DrawerContent>
      </Drawer>
    </div>
  )
}
