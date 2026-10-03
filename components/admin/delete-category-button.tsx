"use client"

import { useActionState, useId, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface DeleteCategoryState {
  error?: string
}

interface StructureCible {
  id: string
  name: string
  parentId: string | null
}

interface DeleteCategoryButtonProps {
  categoryId: string
  categoryName: string
  childCount: number
  productCount: number
  categories: StructureCible[]
  action: (
    prevState: DeleteCategoryState,
    formData: FormData
  ) => Promise<DeleteCategoryState>
}

const BOITE_ERREUR =
  "rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"

/**
 * Ce que la ligne dit d'elle-même, avant tout clic. La contrainte n'est pas une
 * surprise réservée à la confirmation : elle est écrite à côté du contrôle que
 * l'éditeur cherchait.
 */
function raisonVisible(
  childCount: number,
  productCount: number
): string | null {
  if (childCount > 0) {
    return `Suppression impossible : ${childCount} sous-catégorie${childCount > 1 ? "s" : ""} à déplacer`
  }
  if (productCount > 0) {
    return `Suppression à confirmer : ${productCount} Produit${productCount > 1 ? "s" : ""} à réaffecter`
  }
  return null
}

/**
 * `candidateId` descend-elle de `racineId` ? La liste des Structures est
 * complète — la page lui passe tout l'arbre —, donc la remontée de parente en
 * parente suffit. Rattacher une Structure à l'une de ses descendantes
 * refermerait la boucle sur elle-même : la boîte ne propose pas ce qui
 * produirait le refus du serveur.
 */
function descendDe(
  candidateId: string,
  racineId: string,
  parentParId: Map<string, string | null>
): boolean {
  let curseur: string | null = candidateId
  const vus = new Set<string>()
  while (curseur && !vus.has(curseur)) {
    if (curseur === racineId) return true
    vus.add(curseur)
    curseur = parentParId.get(curseur) ?? null
  }
  return false
}

export function DeleteCategoryButton({
  categoryId,
  categoryName,
  childCount,
  productCount,
  categories,
  action,
}: DeleteCategoryButtonProps) {
  const [state, formAction, isPending] = useActionState(action, {})
  // « Bloquer — produits rattachés » n'est pas une cible : c'est l'absence de
  // cible, donc `null` dans l'état du `Select` et l'absence du champ caché.
  // Aucune constante n'est exportée d'ici, et le serveur n'a donc rien à
  // reconnaître : `reassignToCategoryId` porte une Structure réelle, ou rien.
  const [reassignTo, setReassignTo] = useState<string | null>(null)
  const [reparentTo, setReparentTo] = useState<string | null>(null)
  const idProduits = useId()
  const idSousCategories = useId()

  const parentParId = new Map(
    categories.map((candidate) => [candidate.id, candidate.parentId])
  )
  const autres = categories.filter((candidate) => candidate.id !== categoryId)
  const recueils = autres.filter(
    (candidate) => !descendDe(candidate.id, categoryId, parentParId)
  )

  const raison = raisonVisible(childCount, productCount)
  const enfants = childCount > 0
  const produits = productCount > 0
  const confirmation = enfants || produits

  return (
    <div className="flex flex-col items-end gap-1.5">
      {raison ? (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
          {raison}
        </p>
      ) : null}

      {confirmation ? (
        <div className="flex flex-col items-end gap-1.5">
          {/* La suppression seule est refusée par le serveur tant que les
              sous-catégories restent là : le contrôle le dit, et ne ment pas. */}
          {enfants ? (
            <Button variant="destructive" size="sm" disabled>
              {isPending ? "Suppression…" : "Supprimer"}
            </Button>
          ) : null}
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant={enfants ? "outline" : "destructive"}
                  size="sm"
                />
              }
            >
              {isPending
                ? "Suppression…"
                : enfants
                  ? "Déplacer puis supprimer"
                  : "Supprimer"}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-lg">
                  Supprimer « {categoryName} »
                </DialogTitle>
                <DialogDescription>
                  Cette Structure compte {childCount} sous-catégorie
                  {childCount > 1 ? "s" : ""} et {productCount} Produit
                  {productCount > 1 ? "s" : ""} rattaché
                  {productCount > 1 ? "s" : ""}. La suppression est définitive.
                </DialogDescription>
              </DialogHeader>
              <form action={formAction} className="flex flex-col gap-4">
                <input type="hidden" name="categoryId" value={categoryId} />

                {enfants ? (
                  <Field className="gap-1.5">
                    <FieldLabel htmlFor={idSousCategories}>
                      Déplacer les sous-catégories vers
                    </FieldLabel>
                    <Select value={reparentTo} onValueChange={setReparentTo}>
                      <SelectTrigger id={idSousCategories} size="sm">
                        <SelectValue placeholder="Choisir la Structure qui les recueillera" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {recueils.map((recueil) => (
                            <SelectItem key={recueil.id} value={recueil.id}>
                              Déplacer les sous-catégories vers {recueil.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {reparentTo ? (
                      <input
                        type="hidden"
                        name="reparentChildrenToCategoryId"
                        value={reparentTo}
                      />
                    ) : null}
                  </Field>
                ) : null}

                {produits ? (
                  <Field className="gap-1.5">
                    <FieldLabel htmlFor={idProduits}>
                      Déplacer les produits vers
                    </FieldLabel>
                    <Select value={reassignTo} onValueChange={setReassignTo}>
                      <SelectTrigger id={idProduits} size="sm">
                        <SelectValue placeholder="Bloquer — produits rattachés" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={null}>
                            Bloquer — produits rattachés
                          </SelectItem>
                          {autres.map((cible) => (
                            <SelectItem key={cible.id} value={cible.id}>
                              Déplacer les produits vers {cible.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {reassignTo ? (
                      <input
                        type="hidden"
                        name="reassignToCategoryId"
                        value={reassignTo}
                      />
                    ) : null}
                  </Field>
                ) : null}

                {state.error ? (
                  <p className={BOITE_ERREUR}>{state.error}</p>
                ) : null}

                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Annuler
                  </DialogClose>
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={isPending || (enfants && !reparentTo)}
                  >
                    {isPending ? "Suppression…" : "Supprimer définitivement"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col items-end gap-1.5">
          <input type="hidden" name="categoryId" value={categoryId} />
          {state.error ? <p className={BOITE_ERREUR}>{state.error}</p> : null}
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={isPending}
          >
            {isPending ? "Suppression…" : "Supprimer"}
          </Button>
        </form>
      )}
    </div>
  )
}
