"use client"

import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Delete01Icon,
  UndoIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"

import { ImageLibraryPicker } from "@/components/admin/image-library-picker"
import televersementBrouillons, {
  type TeleversementBrouillons,
} from "@/components/admin/televersement-brouillons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EntreeImageProduitFormulaire } from "@/lib/formulaire-produit"
import {
  LIMITE_IMAGES_PRODUIT,
  LONGUEUR_MAX_TEXTE_ALTERNATIF,
  type EntreeBibliothequeImageProduit,
  type ImageProduitGalerie,
} from "@/lib/galerie-image-produit"
import { cn } from "@/lib/utils"

interface ImageGalleryUploadProps {
  images: EntreeImageProduitFormulaire[]
  onChange(images: EntreeImageProduitFormulaire[]): void
  televersement?: TeleversementBrouillons
  bibliotheque?: readonly EntreeBibliothequeImageProduit[]
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

type EtatEnvoi = "en_attente" | "envoi" | "echoue"

interface EnvoiFichier {
  cle: string
  fichier: File
  etat: EtatEnvoi
  message?: string
}

const LIBELLES_ENVOI: Record<EtatEnvoi, string> = {
  en_attente: "En attente",
  envoi: "Envoi en cours…",
  echoue: "Échoué",
}

const MESSAGE_GALERIE_PLEINE =
  "La galerie est pleine : aucune place pour ce fichier"
const MESSAGE_ENVOI_SANS_SUITE = "L'envoi n'a pas abouti"

export function ImageGalleryUpload({
  images,
  onChange,
  televersement = televersementBrouillons,
  bibliotheque = [],
}: ImageGalleryUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const prochaineCle = useRef(0)
  const imagesRef = useRef(images)
  const [envois, setEnvois] = useState<EnvoiFichier[]>([])
  const [releasingDraftId, setReleasingDraftId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  const envoisEnCours = envois.some((envoi) => envoi.etat !== "echoue")

  function changerEnvoi(cle: string, changement: Partial<EnvoiFichier>) {
    setEnvois((actuels) =>
      actuels.map((envoi) =>
        envoi.cle === cle ? { ...envoi, ...changement } : envoi
      )
    )
  }

  function retirerEnvoi(cle: string) {
    setEnvois((actuels) => actuels.filter((envoi) => envoi.cle !== cle))
  }

  function placesRestantes(): number {
    return Math.max(
      0,
      LIMITE_IMAGES_PRODUIT - imagesRef.current.filter(imageEstActive).length
    )
  }

  function ajouterLesEntrees(entrees: typeof images) {
    const suivantes = [...imagesRef.current, ...entrees]
    imagesRef.current = suivantes
    onChange(suivantes)
  }

  /**
   * Chaque fichier porte son état et son propre envoi : un refus n'arrête pas
   * les suivants, et un réessai ne renvoie que ce fichier. Le protocole reste
   * celui du port : une presignation, un envoi, et la represignation sur
   * expiration que `creerTeleversementBrouillons` tient déjà.
   */
  async function envoyerUn(envoi: EnvoiFichier): Promise<void> {
    const places = placesRestantes()
    if (places <= 0) {
      changerEnvoi(envoi.cle, {
        etat: "echoue",
        message: MESSAGE_GALERIE_PLEINE,
      })
      return
    }
    changerEnvoi(envoi.cle, { etat: "envoi", message: undefined })
    const resultat = await televersement.ajouter([envoi.fichier], places)
    if (resultat.ajoutees.length > 0) {
      ajouterLesEntrees(resultat.ajoutees)
      retirerEnvoi(envoi.cle)
      return
    }
    changerEnvoi(envoi.cle, {
      etat: "echoue",
      message: resultat.message ?? MESSAGE_ENVOI_SANS_SUITE,
    })
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    const nouveaux: EnvoiFichier[] = [...files].map((fichier) => ({
      cle: `envoi-${prochaineCle.current++}`,
      fichier,
      etat: "en_attente",
    }))
    setEnvois((actuels) => [...actuels, ...nouveaux])
    try {
      for (const envoi of nouveaux) {
        await envoyerUn(envoi)
      }
    } finally {
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function reessayer(cle: string) {
    const envoi = envois.find((candidat) => candidat.cle === cle)
    if (!envoi || envoi.etat !== "echoue") return
    setError(null)
    await envoyerUn(envoi)
  }

  function setAlt(index: number, alt: string) {
    onChange(
      images.map((candidate, currentIndex) =>
        currentIndex === index ? { ...candidate, alt } : candidate
      )
    )
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
      const resultat = await televersement.relacher(draftId)
      if (!resultat.ok) {
        setError(resultat.message)
        return
      }
      onChange(
        images.filter(
          (image) => image.kind !== "brouillon" || image.draftId !== draftId
        )
      )
    } finally {
      setReleasingDraftId(null)
    }
  }

  function ajouterDepuisLaBibliotheque(image: ImageProduitGalerie) {
    onChange([
      ...images,
      {
        kind: "persistee",
        url: image.url,
        ...(image.alt ? { alt: image.alt } : {}),
      },
    ])
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
            className="flex w-40 flex-col gap-1"
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
            <div className="relative">
              <Image
                src={imageSource(image)}
                alt=""
                width={96}
                height={96}
                sizes="96px"
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
            <Label
              htmlFor={`alt-image-${index}`}
              className="text-[11px] text-muted-foreground"
            >
              Texte alternatif
            </Label>
            <Input
              id={`alt-image-${index}`}
              value={image.alt ?? ""}
              maxLength={LONGUEUR_MAX_TEXTE_ALTERNATIF}
              placeholder={
                image.kind === "brouillon"
                  ? "Obligatoire pour publier"
                  : "Décrivez l'image"
              }
              aria-invalid={
                image.kind === "brouillon" && !image.alt?.trim()
                  ? true
                  : undefined
              }
              onChange={(event) => setAlt(index, event.target.value)}
              className="h-7 px-2 text-xs"
            />
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
      {envois.length > 0 ? (
        <ul
          className="flex flex-col gap-1"
          aria-live="polite"
          aria-label="Envois d'images"
        >
          {envois.map((envoi) => (
            <li
              key={envoi.cle}
              data-envoi-etat={envoi.etat}
              className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
            >
              <span className="min-w-0 truncate">
                {envoi.fichier.name} — {LIBELLES_ENVOI[envoi.etat]}
                {envoi.etat === "echoue" && envoi.message
                  ? ` : ${envoi.message}`
                  : null}
              </span>
              {envoi.etat === "echoue" ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => void reessayer(envoi.cle)}
                >
                  Réessayer
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={
            envoisEnCours ||
            releasingDraftId !== null ||
            entreesActives.length >= LIMITE_IMAGES_PRODUIT
          }
          onClick={() => inputRef.current?.click()}
        >
          {envoisEnCours ? "Envoi en cours…" : "Ajouter des images"}
        </Button>
        <ImageLibraryPicker
          bibliotheque={bibliotheque}
          dejaPresentes={
            new Set(
              images.flatMap((image) =>
                image.kind === "persistee" ? [image.url] : []
              )
            )
          }
          desactivee={
            envoisEnCours ||
            releasingDraftId !== null ||
            entreesActives.length >= LIMITE_IMAGES_PRODUIT
          }
          onChoisir={ajouterDepuisLaBibliotheque}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Envoyées vers Cloudflare R2, {entreesActives.length}/
        {LIMITE_IMAGES_PRODUIT} images (10 Mo max par image).
      </p>
      {error ? (
        <p role="alert" className={cn("text-sm", "text-destructive")}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
