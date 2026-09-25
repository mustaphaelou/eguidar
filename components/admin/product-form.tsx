"use client"

import { Delete01Icon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useActionState, useRef, useState } from "react"

import {
  ImageGalleryUpload,
  type EntreeImageProduitFormulaire,
} from "@/components/admin/image-gallery-upload"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import { centsToInputValue, parseMadToCents } from "@/lib/money"
import { slugify } from "@/lib/slug"

export interface ProductFormVariant {
  id?: string
  name: string
  sku: string
  priceDelta: number
  stock: number
}

export interface ProductFormInitial {
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
  variants: ProductFormVariant[]
}

export interface ProductFormState {
  error?: string
}

interface ProductFormProps {
  product?: ProductFormInitial
  categories: { id: string; name: string }[]
  action: (
    prevState: ProductFormState,
    formData: FormData
  ) => Promise<ProductFormState>
}

const emptyVariant = (): ProductFormVariant => ({
  name: "",
  sku: "",
  priceDelta: 0,
  stock: 0,
})

function imagesSoumises(
  images: readonly EntreeImageProduitFormulaire[]
): EntreeImageProduit[] {
  const soumises: EntreeImageProduit[] = []
  for (const image of images) {
    if (image.kind === "persistee") {
      if (image.suppressionEnAttente) continue
      soumises.push({ kind: "persistee", url: image.url })
      continue
    }
    soumises.push({
      kind: "brouillon",
      draftId: image.draftId,
      previewUrl: image.previewUrl,
    })
  }
  return soumises
}

export function ProductForm({ product, categories, action }: ProductFormProps) {
  const [state, formAction, isPending] = useActionState(action, {})
  const slugRef = useRef<HTMLInputElement>(null)
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "")
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false)
  const [freeShipping, setFreeShipping] = useState(
    product?.freeShipping ?? false
  )
  const [tentativeId] = useState(() => globalThis.crypto.randomUUID())
  const [images, setImages] = useState<EntreeImageProduitFormulaire[]>(
    product?.images ?? []
  )
  const [variants, setVariants] = useState<ProductFormVariant[]>(
    product?.variants ?? [emptyVariant()]
  )

  function setVariant(index: number, patch: Partial<ProductFormVariant>) {
    setVariants((current) =>
      current.map((variant, i) =>
        i === index ? { ...variant, ...patch } : variant
      )
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {product?.id ? (
        <input type="hidden" name="productId" value={product.id} />
      ) : null}
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="isFeatured" value={isFeatured ? "on" : ""} />
      <input
        type="hidden"
        name="freeShipping"
        value={freeShipping ? "on" : ""}
      />
      <input type="hidden" name="tentativeId" value={tentativeId} />
      <input
        type="hidden"
        name="images"
        value={JSON.stringify(imagesSoumises(images))}
      />
      <input type="hidden" name="variants" value={JSON.stringify(variants)} />

      {state.error ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nom</Label>
              <Input
                id="name"
                name="name"
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
                  name="slug"
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
                name="brand"
                required
                defaultValue={product?.brand}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="categoryId">Catégorie</Label>
              <Select
                value={categoryId}
                onValueChange={(value) => setCategoryId(value ?? "")}
              >
                <SelectTrigger id="categoryId" className="w-full">
                  <SelectValue placeholder="Choisir une catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="price">Prix (MAD, TVA incluse)</Label>
              <Input
                id="price"
                name="price"
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
                name="description"
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
              name="specsText"
              placeholder={"Écran : 6,1 pouces\nPuce : A17 Pro"}
              defaultValue={
                product
                  ? Object.entries(product.specs)
                      .map(([k, v]) => `${k} : ${v}`)
                      .join("\n")
                  : ""
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mise en avant</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="isFeatured">
              Produit mis en avant (page d&apos;accueil)
            </Label>
            <Switch
              id="isFeatured"
              checked={isFeatured}
              onCheckedChange={(checked) => setIsFeatured(checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="freeShipping">Livraison offerte</Label>
            <Switch
              id="freeShipping"
              checked={freeShipping}
              onCheckedChange={(checked) => setFreeShipping(checked)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="featuredOrder">Ordre de mise en avant</Label>
            <Input
              id="featuredOrder"
              name="featuredOrder"
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
        <CardContent>
          <ImageGalleryUpload images={images} onChange={setImages} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variantes (tailles, couleurs, SKU…)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
                    value={centsToInputValue(variant.priceDelta)}
                    onChange={(event) =>
                      setVariant(index, {
                        priceDelta: parseMadToCents(event.target.value) ?? 0,
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

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer le produit"}
        </Button>
      </div>
    </form>
  )
}
