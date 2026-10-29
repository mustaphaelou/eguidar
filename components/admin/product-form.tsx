"use client"

import {
  Alert02Icon,
  Delete01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useRef, useState } from "react"

import { ImageGalleryUpload } from "@/components/admin/image-gallery-upload"
import {
  StructurePicker,
  type StructureAvecChemin,
} from "@/components/admin/structure-picker"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  CHAMPS_FORMULAIRE_PRODUIT,
  ecartPrixDepuisTexte,
  galerieSoumiseHorsSuppressionsEnAttente,
  MESSAGE_SECTIONS_INVALIDES,
  texteEcartPrix,
  texteSpecifications,
  valeurCaseACocher,
  type EntreeImageProduitFormulaire,
  type EtatFormulaireProduit,
  type FaitsFormulaireProduit,
  type FaitsVarianteFormulaire,
} from "@/lib/formulaire-produit"
import type { EntreeBibliothequeImageProduit } from "@/lib/galerie-image-produit"
import { centsToInputValue } from "@/lib/money"
import { slugify } from "@/lib/slug"

export type ProductFormState = EtatFormulaireProduit

interface ProductFormProps {
  product?: FaitsFormulaireProduit
  structures: StructureAvecChemin[]
  bibliotheque?: readonly EntreeBibliothequeImageProduit[]
  action: (
    prevState: ProductFormState,
    formData: FormData
  ) => Promise<ProductFormState>
}

const emptyVariant = (): FaitsVarianteFormulaire => ({
  name: "",
  sku: "",
  priceDelta: 0,
  stock: 0,
})

export function ProductForm({
  product,
  structures,
  bibliotheque,
  action,
}: ProductFormProps) {
  const [state, formAction, isPending] = useActionState(action, {})
  const router = useRouter()
  const annulerNavigationRef = useRef<HTMLButtonElement>(null)
  const slugRef = useRef<HTMLInputElement>(null)
  const [modifie, setModifie] = useState(false)
  const [lienEnAttente, setLienEnAttente] = useState<string | null>(null)

  const sectionsEnErreur =
    state.sections && Object.keys(state.sections).length > 0
      ? state.sections
      : undefined
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "")
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false)
  const [freeShipping, setFreeShipping] = useState(
    product?.freeShipping ?? false
  )
  const [tentativeId] = useState(() => globalThis.crypto.randomUUID())
  const [images, setImages] = useState<EntreeImageProduitFormulaire[]>(
    product?.images ?? []
  )
  const [variants, setVariants] = useState<FaitsVarianteFormulaire[]>(
    product?.variants ?? [emptyVariant()]
  )

  function marquerModifie() {
    setModifie(true)
  }

  function setVariant(index: number, patch: Partial<FaitsVarianteFormulaire>) {
    marquerModifie()
    setVariants((current) =>
      current.map((variant, i) =>
        i === index ? { ...variant, ...patch } : variant
      )
    )
  }

  useEffect(() => {
    if (!modifie) return

    const surAvantDechargement = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }

    const surClic = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      const cible =
        event.target instanceof Element ? event.target.closest("a[href]") : null
      if (!(cible instanceof HTMLAnchorElement)) return
      if (cible.target !== "" && cible.target !== "_self") return

      const url = new URL(cible.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return
      }

      event.preventDefault()
      setLienEnAttente(`${url.pathname}${url.search}${url.hash}`)
    }

    window.addEventListener("beforeunload", surAvantDechargement)
    document.addEventListener("click", surClic, true)
    return () => {
      window.removeEventListener("beforeunload", surAvantDechargement)
      document.removeEventListener("click", surClic, true)
    }
  }, [modifie])

  return (
    <form
      action={formAction}
      className="formulaire-produit flex flex-col gap-6"
      onChange={marquerModifie}
      onInput={marquerModifie}
    >
      {product?.id ? (
        <input
          type="hidden"
          name={CHAMPS_FORMULAIRE_PRODUIT.produit}
          value={product.id}
        />
      ) : null}
      <input
        type="hidden"
        name={CHAMPS_FORMULAIRE_PRODUIT.structure}
        value={categoryId}
      />
      <input
        type="hidden"
        name={CHAMPS_FORMULAIRE_PRODUIT.miseEnAvant}
        value={valeurCaseACocher(isFeatured)}
      />
      <input
        type="hidden"
        name={CHAMPS_FORMULAIRE_PRODUIT.livraisonOfferte}
        value={valeurCaseACocher(freeShipping)}
      />
      <input
        type="hidden"
        name={CHAMPS_FORMULAIRE_PRODUIT.tentative}
        value={tentativeId}
      />
      <input
        type="hidden"
        name={CHAMPS_FORMULAIRE_PRODUIT.galerie}
        value={JSON.stringify(galerieSoumiseHorsSuppressionsEnAttente(images))}
      />
      <input
        type="hidden"
        name={CHAMPS_FORMULAIRE_PRODUIT.variantes}
        value={JSON.stringify(variants)}
      />

      {state.error && !sectionsEnErreur ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {sectionsEnErreur ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {MESSAGE_SECTIONS_INVALIDES}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldError>{state.sections?.informations}</FieldError>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nom</Label>
              <Input
                id="name"
                name={CHAMPS_FORMULAIRE_PRODUIT.nom}
                required
                defaultValue={product?.name}
                onChange={(event) => {
                  if (!slugRef.current || slugRef.current.value) return
                  slugRef.current.value = slugify(event.target.value)
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="slug">Slug</Label>
              <div className="flex gap-2">
                <Input
                  ref={slugRef}
                  id="slug"
                  name={CHAMPS_FORMULAIRE_PRODUIT.slug}
                  required
                  defaultValue={product?.slug}
                  placeholder="mon-produit"
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (slugRef.current)
                      slugRef.current.value = slugify(slugRef.current.value)
                  }}
                >
                  Générer
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="brand">Marque</Label>
              <Input
                id="brand"
                name={CHAMPS_FORMULAIRE_PRODUIT.marque}
                required
                defaultValue={product?.brand}
              />
            </div>
            <div className="flex flex-col gap-2">
              <StructurePicker
                id="categoryId"
                valeur={categoryId}
                structures={structures}
                onChange={(valeur) => {
                  marquerModifie()
                  setCategoryId(valeur)
                }}
              />
              <FieldError>{state.sections?.structure}</FieldError>
              {product && product.categoryId === null ? (
                <p
                  role="status"
                  className="flex items-start gap-1.5 text-sm text-destructive"
                >
                  <HugeiconsIcon
                    icon={Alert02Icon}
                    strokeWidth={2}
                    className="mt-0.5 shrink-0"
                  />
                  <span>
                    Ce Produit est sans Structure : sa Structure a été
                    supprimée, il n&apos;apparaît donc sur aucune page de
                    catégorie. Choisissez-en une pour l&apos;enregistrer.
                  </span>
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="price">Prix (MAD, TVA incluse)</Label>
              <Input
                id="price"
                name={CHAMPS_FORMULAIRE_PRODUIT.prix}
                type="number"
                required
                min="0"
                step="0.01"
                defaultValue={product ? centsToInputValue(product.price) : ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name={CHAMPS_FORMULAIRE_PRODUIT.description}
                defaultValue={product?.description}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="specsText">
              Spécifications (une par ligne, format « Clé : valeur »)
            </Label>
            <Textarea
              id="specsText"
              name={CHAMPS_FORMULAIRE_PRODUIT.specifications}
              placeholder={"Écran : 6,1 pouces\nPuce : A17 Pro"}
              defaultValue={product ? texteSpecifications(product.specs) : ""}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mise en avant</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldError>{state.sections?.miseEnAvant}</FieldError>
          <div className="flex items-center justify-between">
            <Label htmlFor="isFeatured">
              Produit mis en avant (page d&apos;accueil)
            </Label>
            <Switch
              id="isFeatured"
              checked={isFeatured}
              onCheckedChange={(checked) => {
                marquerModifie()
                setIsFeatured(checked)
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="freeShipping">Livraison offerte</Label>
            <Switch
              id="freeShipping"
              checked={freeShipping}
              onCheckedChange={(checked) => {
                marquerModifie()
                setFreeShipping(checked)
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="featuredOrder">Ordre de mise en avant</Label>
            <Input
              id="featuredOrder"
              name={CHAMPS_FORMULAIRE_PRODUIT.ordre}
              type="number"
              min="0"
              step="1"
              defaultValue={product?.featuredOrder ?? 0}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldError>{state.sections?.images}</FieldError>
          <ImageGalleryUpload
            images={images}
            onChange={(suivantes) => {
              marquerModifie()
              setImages(suivantes)
            }}
            bibliotheque={bibliotheque}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variantes (tailles, couleurs, SKU…)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldError>{state.sections?.variantes}</FieldError>
          <div className="flex flex-col gap-3">
            {variants.map((variant, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr_1fr_8rem_6rem_auto]"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`variant-name-${index}`} className="text-xs">
                    Nom
                  </Label>
                  <Input
                    id={`variant-name-${index}`}
                    value={variant.name}
                    onChange={(event) =>
                      setVariant(index, { name: event.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`variant-sku-${index}`} className="text-xs">
                    SKU
                  </Label>
                  <Input
                    id={`variant-sku-${index}`}
                    value={variant.sku}
                    onChange={(event) =>
                      setVariant(index, { sku: event.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`variant-delta-${index}`} className="text-xs">
                    Écart prix (MAD)
                  </Label>
                  <Input
                    id={`variant-delta-${index}`}
                    type="number"
                    step="0.01"
                    value={texteEcartPrix(variant.priceDelta)}
                    onChange={(event) =>
                      setVariant(index, {
                        priceDelta: ecartPrixDepuisTexte(event.target.value),
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`variant-stock-${index}`} className="text-xs">
                    Stock
                  </Label>
                  <Input
                    id={`variant-stock-${index}`}
                    type="number"
                    min="0"
                    step="1"
                    value={variant.stock}
                    onChange={(event) =>
                      setVariant(index, {
                        stock: Number(event.target.value) || 0,
                      })
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="destructive"
                  className="self-end"
                  disabled={variants.length === 1}
                  onClick={() =>
                    setVariants((current) =>
                      current.filter((_, i) => i !== index)
                    )
                  }
                  aria-label="Supprimer la variante"
                >
                  <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() =>
              setVariants((current) => [...current, emptyVariant()])
            }
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Ajouter une variante
          </Button>
        </CardContent>
      </Card>

      <div className="barre-enregistrement sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer le produit"}
        </Button>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="text-sm text-muted-foreground"
        >
          {isPending
            ? "Enregistrement en cours…"
            : modifie
              ? "Modifications non enregistrées"
              : ""}
        </p>
      </div>

      <AlertDialog
        open={lienEnAttente !== null}
        onOpenChange={(ouvert) => {
          if (!ouvert) setLienEnAttente(null)
        }}
      >
        <AlertDialogContent initialFocus={annulerNavigationRef}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg">
              Quitter sans enregistrer ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Les modifications de ce Produit ne seront pas enregistrées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              render={<Button ref={annulerNavigationRef} variant="outline" />}
            >
              Rester sur la page
            </AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                const href = lienEnAttente
                setLienEnAttente(null)
                setModifie(false)
                if (href) router.push(href)
              }}
            >
              Quitter sans enregistrer
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}
