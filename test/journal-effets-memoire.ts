import type {
  JournalEffetsPostCommit,
  MesureEffetPostCommit,
} from "@/lib/use-cases/mutation-squelette"

export interface JournalEffetsMemoire extends JournalEffetsPostCommit {
  readonly mesures: MesureEffetPostCommit[]
}

/**
 * Le port de journal en mémoire : il enregistre la mesure telle que
 * `runEffect` la produit, sans console ni horloge propre. Phase 4 remplacera
 * cette implémentation par une écriture durable, sans changer la couture.
 */
export function creerJournalEffetsMemoire(): JournalEffetsMemoire {
  const mesures: MesureEffetPostCommit[] = []
  return {
    mesures,
    enregistrer(mesure) {
      mesures.push(mesure)
    },
  }
}
