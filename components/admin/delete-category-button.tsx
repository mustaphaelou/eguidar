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
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
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

/** Ce qui est rattaché à la Structure de la ligne, et donc ce qui pèse. */
interface ComptesStructure {
  childCount: number
  productCount: number
}

/**
 * **Ce que la boîte reçoit : des faits, et rien d'appelable** (#573, ADR-0030).
 *
 * Les deux listes de cibles sont les deux moitiés d'une **partition**, que la page
 * a calculée sur la même lecture qui lui a rendu ses lignes — la porte rend les
 * deux, et les deux sont d'une forme étroite à part : `ciblesProduits` vaut toute
 * Structure autre que celle-ci — un Produit atterrit où l'on dit, descendantes
 * comprises (US 16) — et `ciblesSousCategories` vaut ce qui ne descend pas d'elle,
 * parce que l'y rattacher refermerait la boucle sur elle-même (US 15). Les deux
 * sont triées dans l'ordre que le module promet, et la boîte ne les trie pas :
 * elle rend ce qu'elle a reçu, dans l'ordre reçu.
 *
 * **Ce qui franchit la couture, ce sont des chaînes** (ADR-0028) : des
 * identifiants, et une table de noms pour que l'éditeur reconnaisse où vont ses
 * Produits (US 18). Ni fonction, ni prédicat, ni marche, ni getter. Une règle de
 * domaine dans un `"use client"` est une règle que la prochaine surface
 * réécrira (US 39) ; celle-ci vit dans le cœur pur, qui se prouve sans base
 * (`lib/marche-structure-partition.test.ts`), et la page la calcule.
 *
 * Le repli sur l'identifiant est le même que celui du journal : un `cuid` se lit
 * mal, mais il est vrai, et la boîte n'a pas à inventer un nom qu'aucune lecture
 * ne lui a donné.
 */
interface DeleteCategoryButtonProps {
  categoryId: string
  categoryName: string
  childCount: number
  productCount: number
  /** Où peut aller un Produit : toute Structure sauf celle-ci. */
  ciblesProduits: readonly string[]
  /** Où peut aller une sous-catégorie : ce qui ne descend pas d'elle. */
  ciblesSousCategories: readonly string[]
  /** Les noms des Structures, par identifiant. */
  nomsStructures: Readonly<Record<string, string>>
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
 * l'éditeur cherchait. Les deux causes que le glossaire énumère — une
 * Structure contenant des sous-catégories, des Produits qui lui sont rattachés —
 * y sont nommées comme lui les nomme, jamais comme un « échec de suppression ».
 */
function raisonVisible(comptes: ComptesStructure): string | null {
  const { childCount, productCount } = comptes
  if (childCount > 0) {
    return `Refus de la Structure : ${childCount} sous-catégorie${childCount > 1 ? "s" : ""} à déplacer`
  }
  if (productCount > 0) {
    // Deux sorties, donc deux mots : la case a cocher rend l'orphelinat
    // saisissable (ADR-0029), et une ligne qui n'en nommerait qu'une
    // mentirait sur ce que la boîte va proposer.
    return `Refus de la Structure : ${productCount} Produit${productCount > 1 ? "s" : ""} à réaffecter ou à laisser sans Structure`
  }
  return null
}

export function DeleteCategoryButton({
  categoryId,
  categoryName,
  childCount,
  productCount,
  ciblesProduits,
  ciblesSousCategories,
  nomsStructures,
  action,
}: DeleteCategoryButtonProps) {
  const [state, formAction, isPending] = useActionState(action, {})
  // « Bloquer — produits rattachés » n'est pas une cible : c'est l'absence de
  // cible, donc `null` dans l'état du `Select` et l'absence du champ caché.
  // Aucune constante n'est exportée d'ici, et le serveur n'a donc rien à
  // reconnaître : `reassignToCategoryId` porte une Structure réelle, ou rien.
  const [reassignTo, setReassignTo] = useState<string | null>(null)
  const [reparentTo, setReparentTo] = useState<string | null>(null)
  // **Les deux choix s'excluent, et c'est l'interface qui l'exige.** Le
  // serveur départage la réaffectation sur l'orphelinat quand les deux
  // arrivent, mais une boîte qui proposerait les deux à la fois laisserait
  // croire qu'ils s'appliquent ensemble. Cocher l'un efface l'autre : un seul
  // choix, une seule conséquence.
  const [orphelinats, setOrphelinats] = useState(false)
  const idProduits = useId()
  const idSousCategories = useId()
  const idOrphelins = useId()

  // **Aucune marche ici, et c'est le déplacement** (#573, ADR-0030). La boîte
  // ne se construit plus de parcours à chaque rendu : elle reçoit les deux listes
  // de cibles, que la page a calculées sur la lecture qu'elle lui rendait déjà,
  // et se contente de les rendre. Trois conséquences, dont une seule est visible :
  // le paquet navigateur ne porte plus de traversée de domaine (US 40), la règle
  // « ce qui descend ne peut pas accueillir une sous-catégorie » n'existe plus
  // qu'en un endroit — le cœur pur, prouvé sans base (US 39) —, et le journal
  // d'un cycle ne se décide plus par le nombre de cibles candidates qu'une boîte
  // affichait.
  //
  // **La divergence d'ADR-0030 ne disparaît pas avec la coupe : elle change de
  // forme.** Elle se lisait ligne à ligne dans `descendDe` : la boîte écartait ce
  // qui descend, le serveur refusait le reste. Elle se lit désormais dans les deux
  // listes reçues — `ciblesSousCategories` ne contient pas la descendance,
  // `ciblesProduits` la contient, sans distinction entre les deux pour le serveur —
  // et dans le fait que `deleteCategory` reste seul à lever
  // `CategoryAncestorCycleError`. La boîte **propose**, le serveur seul **refuse** ;
  // sur un cycle déjà en base, la cible reste donc proposée (US 17).
  const nomDe = (id: string): string => nomsStructures[id] ?? id

  const comptes = { childCount, productCount }
  const raison = raisonVisible(comptes)
  const enfants = comptes.childCount > 0
  const produits = comptes.productCount > 0
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
                        <SelectValue placeholder="Choisir la Structure d'accueil des sous-catégories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {ciblesSousCategories.map((cible) => (
                            <SelectItem key={cible} value={cible}>
                              Déplacer les sous-catégories vers {nomDe(cible)}
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
                    <Select
                      value={orphelinats ? null : reassignTo}
                      onValueChange={(value) => {
                        setReassignTo(value ?? null)
                        if (value) setOrphelinats(false)
                      }}
                      disabled={orphelinats}
                    >
                      <SelectTrigger id={idProduits} size="sm">
                        <SelectValue placeholder="Bloquer — produits rattachés" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={null}>
                            Bloquer — produits rattachés
                          </SelectItem>
                          {ciblesProduits.map((cible) => (
                            <SelectItem key={cible} value={cible}>
                              Déplacer les produits vers {nomDe(cible)}
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

                    {/* La troisième issue (ADR-0029). Elle est une case et non
                        une option du `Select` parce qu'elle n'est pas une cible :
                        c'est l'absence de cible que l'éditeur exprime, et une
                        sentinelle à travers la frontière asynchrone serait
                        remplacée par un mandataire — le serveur ne verrait
                        jamais la valeur qui compte. La case cochée porte un
                        `on`, rien à comparer. */}
                    <div className="flex items-center gap-2 pt-1">
                      <Checkbox
                        id={idOrphelins}
                        checked={orphelinats}
                        onCheckedChange={(coche) => {
                          setOrphelinats(coche === true)
                          if (coche === true) setReassignTo(null)
                        }}
                      />
                      <Label
                        htmlFor={idOrphelins}
                        className="text-sm leading-snug"
                      >
                        Laisser les {productCount} Produit
                        {productCount > 1 ? "s" : ""} sans Structure — ils
                        restent en vente, hors de toute catégorie
                      </Label>
                    </div>
                    {orphelinats ? (
                      <input type="hidden" name="orphanProducts" value="on" />
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
        /* Feuille vide : rien à choisir, rien à nommer — et c'est pour cela
           qu'un `confirm()` suffit. La boîte de dialogue a remplacé
           `confirm()` parce qu'elle **montrait ce que la suppression emportait** :
           où partaient les Produits, où partaient les sous-catégories. Une
           feuille vide n'a rien de tout cela à montrer, et son seul avertissement
           est « cette action est définitive » — une phrase. Lui ouvrir une boîte
           entière pour cela serait du poids mort ; elle resterait le seul cas du
           dépôt sans confirmation, ce que #519 n'a jamais demandé de changer. */
        <form
          action={formAction}
          onSubmit={(event) => {
            if (
              !confirm(
                `Supprimer « ${categoryName} » ? Cette action est définitive.`
              )
            ) {
              event.preventDefault()
            }
          }}
          className="flex flex-col items-end gap-1.5"
        >
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
