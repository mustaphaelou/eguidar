"use client"

import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Delete01Icon,
  UndoIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Image from "next/image"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import type {
  EntreeBrouillonImage,
  EntreeImagePersistee,
} from "@/lib/galerie-image-produit"
import { cn } from "@/lib/utils"

export type EntreeImageProduitFormulaire =
  | (EntreeImagePersistee & { suppressionEnAttente?: boolean })
  | EntreeBrouillonImage

interface ImageGalleryUploadProps {
  images: EntreeImageProduitFormulaire[]
  onChange(images: EntreeImageProduitFormulaire[]): void
}

const MAX_FILES = 8

type ReponsePresign = {
  draftId?: unknown
  uploadUrl?: unknown
  previewUrl?: unknown
}

function entryKey(image: EntreeImageProduitFormulaire): string {
  return image.kind === "persistee"
    ? `persisted:${image.url}`
    : `draft:${image.draftId}`
}

function imageSource(image: EntreeImageProduitFormulaire): string {
  return image.kind === "persistee" ? image.url : image.previewUrl
}

function suppressionEnAttente(image: EntreeImageProduitFormulaire): boolean {
  return image.kind === "persistee" && image.suppressionEnAttente === true
}

function imageEstActive(image: EntreeImageProduitFormulaire): boolean {
  return !suppressionEnAttente(image)
}

export function ImageGalleryUpload({
  images,
  onChange,
}: ImageGalleryUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [releasingDraftId, setReleasingDraftId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      const uploaded: EntreeImageProduitFormulaire[] = []
      // La limite porte sur la galerie *soumise*, donc une Image produit dont
      // la suppression est en attente libère sa place : l'éditeur peut
      // remplacer une image qu'il vient de retirer.
      const placesRestants = Math.max(
        0,
        MAX_FILES - images.filter(imageEstActive).length
      )
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
          kind: "brouillon",
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
    const indexesActifs = images.flatMap((image, currentIndex) =>
      imageEstActive(image) ? [currentIndex] : []
    )
    const position = indexesActifs.indexOf(index)
    const targetPosition = position + direction
    if (position < 0 || targetPosition < 0) return
    const target = indexesActifs[targetPosition]
    if (target === undefined) return
    const next = [...images]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  async function relacherBrouillon(draftId: string) {
    if (releasingDraftId !== null) return
    setError(null)
    setReleasingDraftId(draftId)
    try {
      const response = await fetch("/api/admin/uploads/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: unknown
        } | null
        setError(
          typeof body?.error === "string"
            ? body.error
            : "Échec de la libération du Brouillon d'Image produit"
        )
        return
      }
      onChange(
        images.filter(
          (image) => image.kind !== "brouillon" || image.draftId !== draftId
        )
      )
    } catch {
      setError("Échec de la libération du Brouillon d'Image produit")
    } finally {
      setReleasingDraftId(null)
    }
  }

  function removeImage(index: number) {
    const image = images[index]
    if (!image) return
    if (image.kind === "persistee") {
      onChange(
        images.map((candidate, currentIndex) =>
          currentIndex === index
            ? { ...candidate, suppressionEnAttente: true }
            : candidate
        )
      )
      return
    }
    void relacherBrouillon(image.draftId)
  }

  function annulerSuppression(index: number) {
    onChange(
      images.map((candidate, currentIndex) =>
        currentIndex === index
          ? { ...candidate, suppressionEnAttente: false }
          : candidate
      )
    )
  }

  const entreesActives = images.flatMap((image, index) =>
    imageEstActive(image) ? [{ image, index }] : []
  )
  const suppressionsEnAttente = images.flatMap((image, index) =>
    suppressionEnAttente(image) ? [{ image, index }] : []
  )

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex flex-wrap gap-3"
        role="group"
        aria-label="Images de la galerie"
      >
        {entreesActives.map(({ image, index }, position) => (
          <div
            key={entryKey(image)}
            className="relative"
            data-image-kind={image.kind}
            data-image-state={
              image.kind === "persistee" ? "active" : "brouillon"
            }
            role="group"
            aria-label={
              image.kind === "persistee"
                ? "Image produit"
                : "Brouillon d'Image produit"
            }
          >
            <Image
              src={imageSource(image)}
              alt=""
              width={96}
              height={96}
              className="size-24 rounded-xl border object-cover"
            />
            <span className="absolute start-1 top-1 rounded-full bg-background/80 px-1.5 text-xs">
              {position + 1}
            </span>
            <span className="absolute start-1 top-7 rounded-full bg-background/80 px-1.5 text-[10px]">
              {image.kind === "persistee"
                ? "Image produit"
                : "Brouillon d'Image produit"}
            </span>
            <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1">
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                disabled={position === 0 || releasingDraftId !== null}
                onClick={() => move(index, -1)}
                aria-label="Déplacer avant"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                disabled={
                  position === entreesActives.length - 1 ||
                  releasingDraftId !== null
                }
                onClick={() => move(index, 1)}
                aria-label="Déplacer après"
              >
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="destructive"
                disabled={releasingDraftId !== null}
                onClick={() => removeImage(index)}
                aria-busy={
                  image.kind === "brouillon" &&
                  releasingDraftId === image.draftId
                }
                aria-label={
                  image.kind === "persistee"
                    ? "Supprimer l'image"
                    : releasingDraftId === image.draftId
                      ? "Libération du Brouillon d'Image produit en cours…"
                      : "Libérer le Brouillon d'Image produit"
                }
              >
                <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} />
              </Button>
            </div>
          </div>
        ))}
      </div>
      {suppressionsEnAttente.length > 0 ? (
        <div
          className="flex flex-col gap-2 rounded-xl border border-dashed p-3"
          data-image-state="suppressions-en-attente"
        >
          <p className="text-sm font-medium">
            Suppressions en attente d&apos;enregistrement
          </p>
          <p className="text-xs text-muted-foreground">
            Ces Images produit restent dans le Catalogue et dans le stockage
            jusqu&apos;à un enregistrement réussi.
          </p>
          <div className="flex flex-wrap gap-3">
            {suppressionsEnAttente.map(({ image, index }) => (
              <div
                key={entryKey(image)}
                className="relative"
                data-image-kind={image.kind}
                data-image-state="suppression-en-attente"
                role="group"
                aria-label="Image produit, suppression en attente"
              >
                <Image
                  src={imageSource(image)}
                  alt=""
                  width={96}
                  height={96}
                  className="size-24 rounded-xl border object-cover opacity-50"
                />
                <span className="absolute inset-x-1 top-1 rounded-full bg-background/90 px-1.5 text-center text-[10px]">
                  Suppression en attente
                </span>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="outline"
                  disabled={releasingDraftId !== null}
                  onClick={() => annulerSuppression(index)}
                  aria-label="Annuler la suppression de l'image"
                  className="absolute inset-x-1 bottom-1"
                >
                  <HugeiconsIcon icon={UndoIcon} strokeWidth={2} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
      {/* La limite porte sur la galerie soumise, donc sur les entrées
          actives : une suppression en attente libère une place, et c'est le
          bouton qui doit la rendre utilisable (`placesRestants` reste la borne
          dure à l'envoi). */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={
          uploading ||
          releasingDraftId !== null ||
          entreesActives.length >= MAX_FILES
        }
        onClick={() => inputRef.current?.click()}
        className="w-fit"
      >
        {uploading ? "Envoi en cours…" : "Ajouter des images"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Envoyées vers Cloudflare R2, {entreesActives.length}/{MAX_FILES} images
        (10 Mo max par image).
      </p>
      {error ? (
        <p className={cn("text-sm", "text-destructive")}>{error}</p>
      ) : null}
    </div>
  )
}
