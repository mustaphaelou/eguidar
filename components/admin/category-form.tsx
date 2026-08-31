"use client"

import Image from "next/image"
import { useActionState, useRef, useState } from "react"

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

export const NO_PARENT_VALUE = "none"

export interface CategoryFormInitial {
  id?: string
  name: string
  slug: string
  parentId: string | null
  image: string | null
}

export interface CategoryFormState {
  error?: string
}

interface CategoryFormProps {
  category?: CategoryFormInitial
  categories: { id: string; name: string }[]
  excludedParentIds?: string[]
  action: (
    prevState: CategoryFormState,
    formData: FormData
  ) => Promise<CategoryFormState>
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function CategoryForm({
  category,
  categories,
  excludedParentIds = [],
  action,
}: CategoryFormProps) {
  const [state, formAction, isPending] = useActionState(action, {})
  const slugRef = useRef<HTMLInputElement>(null)
  const [parentId, setParentId] = useState(
    category?.parentId ?? NO_PARENT_VALUE
  )
  const [image, setImage] = useState(category?.image ?? "")
  const excluded = new Set(excludedParentIds)
  const parentOptions = categories.filter(
    (candidate) => !excluded.has(candidate.id)
  )

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {category?.id ? (
        <input type="hidden" name="categoryId" value={category.id} />
      ) : null}
      <input type="hidden" name="parentId" value={parentId} />

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
                defaultValue={category?.name}
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
                  defaultValue={category?.slug}
                  placeholder="ma-categorie"
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
              <Label htmlFor="parentId">Catégorie parente</Label>
              <Select
                value={parentId}
                onValueChange={(value) => setParentId(value ?? NO_PARENT_VALUE)}
              >
                <SelectTrigger id="parentId" className="w-full">
                  <SelectValue placeholder="Aucune (catégorie racine)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NO_PARENT_VALUE}>
                      Aucune (catégorie racine)
                    </SelectItem>
                    {parentOptions.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="image">Image (URL)</Label>
              <Input
                id="image"
                name="image"
                placeholder="https://…"
                value={image}
                onChange={(event) => setImage(event.target.value)}
              />
            </div>
          </div>
          {image ? (
            <Image
              src={image}
              alt=""
              width={96}
              height={96}
              className="size-24 rounded-xl border object-cover"
            />
          ) : null}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer la catégorie"}
        </Button>
      </div>
    </form>
  )
}
