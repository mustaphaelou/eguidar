"use client"

import { useCallback, useId, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"

import {
  DeplacementStructure,
  GestesStructure,
  type ActionDeplacement,
  type DestinationStructure,
  type LigneStructureVue,
} from "@/components/admin/deplacement-structure"
import { DeleteCategoryButton } from "@/components/admin/delete-category-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { IntentionsDeplacement } from "@/app/admin/categories/intentions-de-deplacement"

export type ActionSuppression = (
  precedent: { error?: string },
  formData: FormData
) => Promise<{ error?: string }>

export interface CibleSuppressionVue {
  produits: readonly string[]
  sousCategories: readonly string[]
}

interface TableauStructureProps {
  lignes: readonly LigneStructureVue[]
  intentions: Readonly<Record<string, IntentionsDeplacement>>
  destinations: readonly DestinationStructure[]
  cibles: Readonly<Record<string, CibleSuppressionVue>>
  nomsStructures: Readonly<Record<string, string>>
  actionSuppression: ActionSuppression
  actionDeplacement: ActionDeplacement
}

const INTENTIONS_VIDES: IntentionsDeplacement = {
  monter: null,
  descendre: null,
  indenter: null,
  desindenter: null,
}

function normaliser(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
}

function ancetresDe(
  id: string,
  parentParId: ReadonlyMap<string, string | null>
): string[] {
  const ancetres: string[] = []
  const vus = new Set<string>([id])
  let parente = parentParId.get(id) ?? null
  while (parente !== null && !vus.has(parente)) {
    vus.add(parente)
    ancetres.push(parente)
    parente = parentParId.get(parente) ?? null
  }
  return ancetres
}

export function TableauStructure({
  lignes,
  intentions,
  destinations,
  cibles,
  nomsStructures,
  actionSuppression,
  actionDeplacement,
}: TableauStructureProps) {
  const [requete, setRequete] = useState("")
  const [replies, setReplies] = useState<ReadonlySet<string>>(new Set())
  const [annonce, setAnnonce] = useState<{ texte: string; rang: number }>({
    texte: "",
    rang: 0,
  })
  const idRecherche = useId()

  const annoncer = useCallback(
    (resultat: { texte: string; refus: boolean }) => {
      setAnnonce((precedente) => ({
        texte: resultat.texte,
        rang: precedente.rang + 1,
      }))
    },
    []
  )

  const parentParId = useMemo(
    () => new Map(lignes.map((ligne) => [ligne.id, ligne.parentId])),
    [lignes]
  )

  const idsVisibles = useMemo(() => {
    const requeteNormalisee = normaliser(requete.trim())
    if (requeteNormalisee === "") {
      return new Set(
        lignes
          .filter(
            (ligne) =>
              ligne.horsArbre ||
              ancetresDe(ligne.id, parentParId).every(
                (ancetre) => !replies.has(ancetre)
              )
          )
          .map((ligne) => ligne.id)
      )
    }

    const visibles = new Set(
      lignes
        .filter(
          (ligne) =>
            normaliser(ligne.name).includes(requeteNormalisee) ||
            normaliser(ligne.slug).includes(requeteNormalisee) ||
            ligne.chemin.some((maillon) =>
              normaliser(maillon.name).includes(requeteNormalisee)
            )
        )
        .map((ligne) => ligne.id)
    )
    for (const id of [...visibles]) {
      for (const ancetre of ancetresDe(id, parentParId)) visibles.add(ancetre)
    }
    return visibles
  }, [lignes, parentParId, requete, replies])

  const basculer = (id: string): void => {
    setReplies((precedentes) => {
      const suivantes = new Set(precedentes)
      if (suivantes.has(id)) suivantes.delete(id)
      else suivantes.add(id)
      return suivantes
    })
  }

  const lignesVisibles = lignes.filter((ligne) => idsVisibles.has(ligne.id))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idRecherche} className="sr-only">
          Rechercher une Structure
        </label>
        <div className="relative w-full max-w-sm">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground"
          />
          <Input
            id={idRecherche}
            type="search"
            value={requete}
            onChange={(evenement) => setRequete(evenement.target.value)}
            placeholder="Rechercher une Structure…"
            className="h-9 ps-9"
          />
        </div>
      </div>

      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-rang={annonce.rang}
        className="min-h-5 text-sm text-muted-foreground"
      >
        {annonce.texte}
      </p>

      <div className="hidden overflow-clip rounded-xl border bg-card lg:block">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Catégorie</TableHead>
              <TableHead>Produits</TableHead>
              <TableHead className="hidden lg:table-cell">Position</TableHead>
              <TableHead className="text-end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lignesVisibles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Aucune Structure ne correspond à cette recherche.
                </TableCell>
              </TableRow>
            ) : null}
            {lignesVisibles.map((ligne) => {
              const replie = replies.has(ligne.id)
              const cible = cibles[ligne.id] ?? {
                produits: [],
                sousCategories: [],
              }
              return (
                <TableRow
                  key={ligne.id}
                  data-structure={ligne.id}
                  data-niveau={ligne.profondeur}
                  data-position={ligne.position}
                  data-hors-arbre={ligne.horsArbre || undefined}
                >
                  <TableCell>
                    <div
                      className="flex items-center gap-3"
                      style={{ paddingLeft: ligne.profondeur * 24 }}
                    >
                      {ligne.nombreEnfants > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-expanded={!replie}
                          aria-label={`${replie ? "Développer" : "Réduire"} ${ligne.name}`}
                          onClick={() => basculer(ligne.id)}
                        >
                          <HugeiconsIcon
                            icon={replie ? ArrowRight01Icon : ArrowDown01Icon}
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                        </Button>
                      ) : (
                        <span className="size-6 shrink-0" aria-hidden="true" />
                      )}
                      {ligne.image ? (
                        <Image
                          src={ligne.image}
                          alt=""
                          width={40}
                          height={40}
                          className="size-10 shrink-0 rounded-lg border object-cover"
                        />
                      ) : null}
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium">{ligne.name}</span>
                        <span className="sr-only">
                          Niveau {ligne.profondeur + 1}, position{" "}
                          {ligne.position} sur {ligne.nombreFreres}
                        </span>
                        <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                          {ligne.horsArbre ? (
                            <Badge variant="destructive">hors arbre</Badge>
                          ) : (
                            <span className="truncate">
                              {ligne.parentId === null
                                ? "Catégorie racine"
                                : ligne.chemin
                                    .map((maillon) => maillon.name)
                                    .join(" / ")}
                            </span>
                          )}
                          <span aria-hidden="true">·</span>
                          <span className="shrink-0 font-mono text-xs">
                            {ligne.slug}
                          </span>
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <Badge variant="secondary" className="tabular-nums">
                        {ligne.nombreProduits} direct
                        {ligne.nombreProduits > 1 ? "s" : ""}
                      </Badge>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {ligne.nombreProduitsCumules} au total
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {ligne.horsArbre ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm whitespace-nowrap tabular-nums">
                          {ligne.position} sur {ligne.nombreFreres}
                        </span>
                        <GestesStructure
                          ligne={ligne}
                          intentions={intentions[ligne.id] ?? INTENTIONS_VIDES}
                          action={actionDeplacement}
                          onResultat={annoncer}
                        />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      <DeplacementStructure
                        ligne={ligne}
                        destinations={destinations}
                        action={actionDeplacement}
                        onResultat={annoncer}
                      />
                      <Button
                        render={<Link href={`/admin/categories/${ligne.id}`} />}
                        variant="ghost"
                        size="sm"
                      >
                        Modifier
                      </Button>
                      <DeleteCategoryButton
                        categoryId={ligne.id}
                        categoryName={ligne.name}
                        childCount={ligne.nombreEnfants}
                        productCount={ligne.nombreProduits}
                        ciblesProduits={cible.produits}
                        ciblesSousCategories={cible.sousCategories}
                        nomsStructures={nomsStructures}
                        action={actionSuppression}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col divide-y overflow-clip rounded-xl border bg-card lg:hidden">
        {lignesVisibles.map((ligne) => {
          const replie = replies.has(ligne.id)
          const cible = cibles[ligne.id] ?? {
            produits: [],
            sousCategories: [],
          }
          return (
            <div
              key={ligne.id}
              className="flex flex-col gap-3 p-3"
              data-mobile-structure={ligne.id}
              data-structure={ligne.id}
              data-niveau={ligne.profondeur}
              data-position={ligne.position}
            >
              <div
                className="flex items-start gap-2"
                style={{ paddingLeft: ligne.profondeur * 16 }}
              >
                {ligne.nombreEnfants > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-expanded={!replie}
                    aria-label={`${replie ? "Développer" : "Réduire"} ${ligne.name}`}
                    onClick={() => basculer(ligne.id)}
                  >
                    <HugeiconsIcon
                      icon={replie ? ArrowRight01Icon : ArrowDown01Icon}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                  </Button>
                ) : null}
                {ligne.image ? (
                  <Image
                    src={ligne.image}
                    alt=""
                    width={40}
                    height={40}
                    className="size-10 shrink-0 rounded-lg border object-cover"
                  />
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{ligne.name}</span>
                  <span className="sr-only">
                    Niveau {ligne.profondeur + 1}, position {ligne.position} sur{" "}
                    {ligne.nombreFreres}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    {ligne.horsArbre ? (
                      <Badge variant="destructive">hors arbre</Badge>
                    ) : (
                      <span className="truncate">
                        {ligne.parentId === null
                          ? "Catégorie racine"
                          : ligne.chemin
                              .map((maillon) => maillon.name)
                              .join(" / ")}
                      </span>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="shrink-0 font-mono">{ligne.slug}</span>
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <Badge variant="secondary" className="tabular-nums">
                    {ligne.nombreProduits} direct
                    {ligne.nombreProduits > 1 ? "s" : ""}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {ligne.nombreProduitsCumules} au total
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {ligne.horsArbre ? (
                  <span className="text-xs text-muted-foreground">
                    Hors arbre
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {ligne.position} sur {ligne.nombreFreres}
                    </span>
                    <GestesStructure
                      ligne={ligne}
                      intentions={intentions[ligne.id] ?? INTENTIONS_VIDES}
                      action={actionDeplacement}
                      onResultat={annoncer}
                    />
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <DeplacementStructure
                    ligne={ligne}
                    destinations={destinations}
                    action={actionDeplacement}
                    onResultat={annoncer}
                  />
                  <Button
                    render={<Link href={`/admin/categories/${ligne.id}`} />}
                    variant="ghost"
                    size="sm"
                  >
                    Modifier
                  </Button>
                  <DeleteCategoryButton
                    categoryId={ligne.id}
                    categoryName={ligne.name}
                    childCount={ligne.nombreEnfants}
                    productCount={ligne.nombreProduits}
                    ciblesProduits={cible.produits}
                    ciblesSousCategories={cible.sousCategories}
                    nomsStructures={nomsStructures}
                    action={actionSuppression}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
