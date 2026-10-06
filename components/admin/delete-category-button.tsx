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
import {
  marcheDesStructures,
  type MarcheStructure,
  type StructureLue,
} from "@/lib/marche-structure"

export interface DeleteCategoryState {
  error?: string
}

/** Ce qui est rattaché à la Structure de la ligne, et donc ce qui pèse. */
interface ComptesStructure {
  childCount: number
  productCount: number
}

interface DeleteCategoryButtonProps {
  categoryId: string
  categoryName: string
  childCount: number
  productCount: number
  categories: StructureLue[]
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

/**
 * `candidateId` descend-elle de `racineId` ? C'est la **Marche de la
 * Structure** qui répond (#551, ADR-0030) : `ancetres` rend la chaîne de la
 * candidate jusqu'à sa racine, la candidate en dernier, et s'arrête sur toute
 * revisite.
 *
 * **La coupe du client et le refus du serveur divergent, et c'est la décision
 * d'ADR-0030, pas un accident.** La marche répond un fait — la chaîne —, et la
 * boîte n'en tire qu'une coupe : ce qui descend de la Structure supprimée ne
 * peut pas l'accueillir, parce que le rattacher refermerait la boucle sur
 * elle-même. Sur un cycle déjà en base, la remontée s'arrête sans rien refuser,
 * la cible reste proposée, et c'est le serveur seul qui peut dire que sa chaîne
 * est cyclique : `assertAcyclicCategoryTree` porte ce refus, lié à sa
 * transaction, et reste le seul à lever `CategoryAncestorCycleError`. La
 * divergence est argumentée dans ADR-0030 ; ce commentaire n'en est plus le
 * propriétaire, il dit seulement où elle vit.
 */
function descendDe(
  candidateId: string,
  racineId: string,
  marche: MarcheStructure
): boolean {
  return marche.ancetres(candidateId).includes(racineId)
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
  // **Les deux choix s'excluent, et c'est l'interface qui l'exige.** Le
  // serveur départage la réaffectation sur l'orphelinat quand les deux
  // arrivent, mais une boîte qui proposerait les deux à la fois laisserait
  // croire qu'ils s'appliquent ensemble. Cocher l'un efface l'autre : un seul
  // choix, une seule conséquence.
  const [orphelinats, setOrphelinats] = useState(false)
  const idProduits = useId()
  const idSousCategories = useId()
  const idOrphelins = useId()

  // **Une seule marche par rendu**, et non une par candidate : construite dans
  // le filtre, elle ferait dédupliquer le journal par candidate — une ligne par
  // cible au lieu d'une par cycle — et le filtre coûterait un parcours complet
  // par cible (#551). Les noms y entrent pour que la ligne du journal nomme les
  // Structures plutôt que leurs identifiants.
  const marche = marcheDesStructures(categories)
  // Toute Structure de la liste sauf celle-ci : c'est le domaine de tous les
  // choix. Les sous-catégories, elles, ne peuvent recevoir que ce qui n'en
  // descend pas — une cible y fermerait la boucle sur elle-même.
  const structuresCandidates = categories.filter(
    (candidate) => candidate.id !== categoryId
  )
  const structuresDAccueil = structuresCandidates.filter(
    (candidate) => !descendDe(candidate.id, categoryId, marche)
  )

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
                          {structuresDAccueil.map((accueil) => (
                            <SelectItem key={accueil.id} value={accueil.id}>
                              Déplacer les sous-catégories vers {accueil.name}
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
                          {structuresCandidates.map((cible) => (
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
