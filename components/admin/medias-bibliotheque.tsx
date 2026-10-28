"use client"

import {
  Copy01Icon,
  GridViewIcon,
  Image01Icon,
  ListViewIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Image from "next/image"
import Link from "next/link"
import { useActionState, useMemo, useState } from "react"

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
        className="flex flex-wrap items-end gap-2"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="medias-q">Rechercher une Image produit</Label>
          <Input
            id="medias-q"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Texte alternatif, adresse ou Produit…"
            className="w-72"
          />
        </div>
        {params.inutilisees ? (
          <input type="hidden" name="inutilisees" value="1" />
        ) : null}
        {params.sansAlt ? (
          <input type="hidden" name="sans-alt" value="1" />
        ) : null}
        <Button type="submit" variant="outline" size="sm">
          Rechercher
        </Button>
        {filtresActifs ? (
          <Button
            variant="ghost"
            size="sm"
            render={<Link href={buildMediasListingUrl({})} />}
          >
            Réinitialiser
          </Button>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={params.inutilisees ? "default" : "outline"}
          size="sm"
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
          variant={params.sansAlt ? "default" : "outline"}
          size="sm"
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
        <div className="ms-auto flex items-center gap-1">
          <Button
            type="button"
            variant={vue === "grille" ? "default" : "outline"}
            size="sm"
            aria-pressed={vue === "grille"}
            onClick={() => setVue("grille")}
          >
            <HugeiconsIcon icon={GridViewIcon} strokeWidth={2} />
            Grille
          </Button>
          <Button
            type="button"
            variant={vue === "liste" ? "default" : "outline"}
            size="sm"
            aria-pressed={vue === "liste"}
            onClick={() => setVue("liste")}
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
        {page.images.length} Image(s) produit affichée(s) sur {page.totalCount}{" "}
        au registre · {page.inutiliseesCount} inutilisée(s) ·{" "}
        {page.sansAltCount} sans texte alternatif
        {selectionEffective.size > 0
          ? ` · ${selectionEffective.size} sélectionnée(s)`
          : ""}
      </p>

      {selectionEffective.size > 0 ? (
        <form
          action={supprimerAction}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3"
        >
          {[...selectionEffective].map((publicUrl) => (
            <input
              key={publicUrl}
              type="hidden"
              name="publicUrl"
              value={publicUrl}
            />
          ))}
          <span className="text-sm">
            {selectionEffective.size} sélectionnée(s)
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
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          <HugeiconsIcon
            icon={Image01Icon}
            strokeWidth={2}
            className="mx-auto mb-2 size-8"
          />
          Aucune Image produit ne correspond à ces critères.
        </p>
      ) : vue === "grille" ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {page.images.map((image) => (
            <li
              key={image.publicUrl}
              data-image-url={image.publicUrl}
              className="flex flex-col gap-2 rounded-xl border p-2"
            >
              <div className="flex items-start justify-between gap-2">
                <Checkbox
                  checked={selectionEffective.has(image.publicUrl)}
                  onCheckedChange={() => basculer(image.publicUrl)}
                  aria-label={`Sélectionner l'Image produit ${
                    image.alt ?? image.publicUrl
                  }`}
                />
                <span className="text-[11px] text-muted-foreground">
                  {image.usageCount > 0
                    ? `Utilisée (${image.usageCount})`
                    : "Inutilisée"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailUrl(image.publicUrl)}
                className="self-center"
                aria-label="Ouvrir le détail de l'Image produit"
              >
                <Image
                  src={image.publicUrl}
                  alt={image.alt ?? ""}
                  width={96}
                  height={96}
                  sizes="96px"
                  className="size-24 rounded-lg border object-cover"
                />
              </button>
              <p className="line-clamp-2 text-xs">
                {image.alt ?? (
                  <span className="text-destructive">
                    Sans texte alternatif
                  </span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {dimensions(image)} · {formatTaille(image.byteSize)} ·{" "}
                {image.mimeType}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sélection</TableHead>
              <TableHead>Image produit</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Dimensions</TableHead>
              <TableHead>Taille</TableHead>
              <TableHead>Utilisation</TableHead>
              <TableHead>Texte alternatif</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.images.map((image) => (
              <TableRow key={image.publicUrl} data-image-url={image.publicUrl}>
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
                    <span className="max-w-48 truncate">{image.publicUrl}</span>
                  </button>
                </TableCell>
                <TableCell>{image.mimeType}</TableCell>
                <TableCell>{dimensions(image)}</TableCell>
                <TableCell>{formatTaille(image.byteSize)}</TableCell>
                <TableCell>{usageLabel(image)}</TableCell>
                <TableCell>{image.alt ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
