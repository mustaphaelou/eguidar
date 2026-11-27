"use client"

import { useActionState, useState } from "react"

import type { AnnonceFormState } from "@/app/admin/annonce/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  ANNONCE_LIEN_LIBELLE_MAX_LENGTH,
  ANNONCE_MESSAGE_MAX_LENGTH,
  apparierLienAnnonce,
  LIEN_ANNONCE,
  RECETTE_TEXTE_ANNONCE,
  RUBAN_ANNONCE_CONTENU,
  RUBAN_ANNONCE_SURFACE,
} from "@/lib/annonce-contrat"
import { cn } from "@/lib/utils"

interface AnnonceFormProps {
  initialAnnonce: {
    actif: boolean
    message: string
    lienUrl: string | null
    lienLibelle: string | null
  }
  action: (
    prevState: AnnonceFormState,
    formData: FormData
  ) => Promise<AnnonceFormState>
}

export function AnnonceForm({ initialAnnonce, action }: AnnonceFormProps) {
  const [state, formAction, isPending] = useActionState(action, {})
  const [actif, setActif] = useState(initialAnnonce.actif)
  const [message, setMessage] = useState(initialAnnonce.message)
  const [lienUrl, setLienUrl] = useState(initialAnnonce.lienUrl ?? "")
  const [lienLibelle, setLienLibelle] = useState(
    initialAnnonce.lienLibelle ?? ""
  )

  const messageApercu = message.trim()
  const lienApercu = apparierLienAnnonce(lienUrl, lienLibelle)

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {state.saved ? (
        <p
          role="status"
          className="rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm text-foreground"
        >
          Annonce enregistrée.
        </p>
      ) : null}

      <section
        aria-label="Aperçu sur la boutique"
        className="flex flex-col gap-2"
      >
        <p className="text-sm font-medium text-foreground">
          Aperçu sur la boutique
        </p>
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          {!actif ? (
            <p className="px-4 py-3 text-center text-sm text-muted-foreground">
              Masquée sur la boutique — aucun ruban affiché.
            </p>
          ) : messageApercu === "" ? (
            <p className="px-4 py-3 text-center text-sm text-muted-foreground">
              Saisissez un message pour prévisualiser le ruban.
            </p>
          ) : (
            <div className={RUBAN_ANNONCE_SURFACE}>
              <div
                className={cn(
                  RECETTE_TEXTE_ANNONCE,
                  RUBAN_ANNONCE_CONTENU,
                  "px-4 sm:px-6"
                )}
              >
                <p className="break-words">{messageApercu}</p>
                {lienApercu ? (
                  <span
                    className={LIEN_ANNONCE}
                    data-preview-href={lienApercu.url}
                  >
                    {lienApercu.libelle}
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="annonce-actif">Afficher sur la boutique</Label>
          <p className="text-sm text-muted-foreground">
            Active ou masque le ruban d&apos;information sur toutes les pages de
            la boutique.
          </p>
        </div>
        <input type="hidden" name="actif" value={actif ? "true" : "false"} />
        <Switch
          id="annonce-actif"
          checked={actif}
          onCheckedChange={setActif}
          aria-label="Afficher sur la boutique"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="annonce-message">Message</Label>
        <Input
          id="annonce-message"
          name="message"
          type="text"
          maxLength={ANNONCE_MESSAGE_MAX_LENGTH}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Livraison offerte dès 500 MAD partout au Maroc"
        />
        <p className="text-sm text-muted-foreground">
          {ANNONCE_MESSAGE_MAX_LENGTH} caractères maximum. Requis lorsque
          l&apos;Annonce est active.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="annonce-lien-url">Lien interne (optionnel)</Label>
          <Input
            id="annonce-lien-url"
            name="lienUrl"
            type="text"
            value={lienUrl}
            onChange={(event) => setLienUrl(event.target.value)}
            placeholder="/produits"
          />
          <p className="text-sm text-muted-foreground">
            Chemin relatif interne commençant par /.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="annonce-lien-libelle">
            Libellé du lien (optionnel)
          </Label>
          <Input
            id="annonce-lien-libelle"
            name="lienLibelle"
            type="text"
            maxLength={ANNONCE_LIEN_LIBELLE_MAX_LENGTH}
            value={lienLibelle}
            onChange={(event) => setLienLibelle(event.target.value)}
            placeholder="Découvrir"
          />
          <p className="text-sm text-muted-foreground">
            {ANNONCE_LIEN_LIBELLE_MAX_LENGTH} caractères maximum. Renseigné avec
            le lien interne.
          </p>
        </div>
      </div>

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer l'Annonce"}
        </Button>
      </div>
    </form>
  )
}
