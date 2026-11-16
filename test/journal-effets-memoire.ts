import type {
  JournalEffetsPostCommit,
  MesureEffetPostCommit,
} from "@/lib/use-cases/mutation-squelette"

export interface JournalEffetsMemoire extends JournalEffetsPostCommit {
  readonly mesures: MesureEffetPostCommit[]
}

export function creerJournalEffetsMemoire(): JournalEffetsMemoire {
  const mesures: MesureEffetPostCommit[] = []
  return {
    mesures,
    enregistrer(mesure) {
      mesures.push(mesure)
    },
  }
}
