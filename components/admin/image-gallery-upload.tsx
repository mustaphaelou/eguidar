"use client"

import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Delete01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Image from "next/image"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import { cn } from "@/lib/utils"

interface ImageGalleryUploadProps {
  images: EntreeImageProduit[]
  onChange(images: EntreeImageProduit[]): void
}

const MAX_FILES = 8

type ReponsePresign = {
  draftId?: unknown
  uploadUrl?: unknown
  previewUrl?: unknown
}

function entryKey(image: EntreeImageProduit): string {
  return image.kind === "persisted"
    ? `persisted:${image.url}`
    : `draft:${image.draftId}`
}

function imageSource(image: EntreeImageProduit): string {
  return image.kind === "persisted" ? image.url : image.previewUrl
}

export function ImageGalleryUpload({
  images,
  onChange,
}: ImageGalleryUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      const uploaded: EntreeImageProduit[] = []
      const placesRestants = Math.max(0, MAX_FILES - images.length)
      for (const file of Array.from(files)) {
        if (uploaded.length >= placesRestants) break
        if (!file.type.startsWith("image/")) {
          setError("Seuls les fichiers image sont acceptés")
          continue
        }

        const response = await fetch("/api/admin/uploads/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentType: file.type, size: file.size }),
        })
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string
          } | null
          setError(body?.error ?? "Échec de la pré-signature")
          continue
        }

        const body = (await response
          .json()
          .catch(() => null)) as ReponsePresign | null
        if (
          !body ||
          typeof body.draftId !== "string" ||
          typeof body.uploadUrl !== "string" ||
          typeof body.previewUrl !== "string"
        ) {
          setError("Réponse de téléversement invalide")
          continue
        }

        const upload = await fetch(body.uploadUrl, {
          method: "PUT",
          body: file,
        })
        if (!upload.ok) {
          setError("Échec de l'envoi vers le stockage")
          continue
        }
        uploaded.push({
          kind: "draft",
          draftId: body.draftId,
          previewUrl: body.previewUrl,
        })
      }
      if (uploaded.length > 0) onChange([...images, ...uploaded])
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...images]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  function removeImage(index: number) {
    if (!images[index]) return
    onChange(images.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {images.map((image, index) => (
          <div key={entryKey(image)} className="relative">
            <Image
              src={imageSource(image)}
              alt=""
              width={96}
              height={96}
              className="size-24 rounded-xl border object-cover"
            />
            <span className="absolute start-1 top-1 rounded-full bg-background/80 px-1.5 text-xs">
              {index + 1}
            </span>
            <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1">
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                aria-label="Déplacer avant"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                disabled={index === images.length - 1}
                onClick={() => move(index, 1)}
                aria-label="Déplacer après"
              >
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="destructive"
                onClick={() => removeImage(index)}
                aria-label="Supprimer l'image"
              >
                <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading || images.length >= MAX_FILES}
        onClick={() => inputRef.current?.click()}
        className="w-fit"
      >
        {uploading ? "Envoi en cours…" : "Ajouter des images"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Envoyées vers Cloudflare R2, {images.length}/{MAX_FILES} images (10 Mo
        max par image).
      </p>
      {error ? (
        <p className={cn("text-sm", "text-destructive")}>{error}</p>
      ) : null}
    </div>
  )
}
