"use client"

import { useEffect, useState } from "react"

import { usePanierQuiChange } from "./panier-qui-change"

/**
 * La lecture HTTP du Panier d'une surface cliente : relancée à chaque
 * changement du Panier, abandonnée au démontage ou à la lecture suivante, et
 * silencieuse en cas d'échec (`null`).
 *
 * Le résultat porte la version du Panier qu'il a lue. Dès qu'un changement est
 * signalé, la version courante ne correspond plus : la surface repart de
 * `null` sans attendre la relecture. Après un succès, une relecture en échec ne
 * laisse donc pas à l'écran le compte ou le corps de la lecture précédente
 * (ADR-0038) ; le badge disparaît et l'Aperçu retrouve son squelette.
 */
export function useLectureDuPanier<T>(
  lire: (signal: AbortSignal) => Promise<T | null>
): T | null {
  const version = usePanierQuiChange()
  const [resultat, setResultat] = useState<{
    version: number
    valeur: T
  } | null>(null)

  useEffect(() => {
    const controleur = new AbortController()
    void lire(controleur.signal)
      .then((corps) => {
        if (corps === null || controleur.signal.aborted) return
        setResultat({ version, valeur: corps })
      })
      .catch(() => {
        // `lire` avale déjà ses erreurs HTTP ; une promesse rejetée reste une
        // lecture manquée, et la surface vide est l'état voulu.
      })
    return () => controleur.abort()
  }, [lire, version])

  return resultat?.version === version ? resultat.valeur : null
}
