import { lireLaPorteDeFusion } from "@/infra/porte-de-fusion"

export const CONTRAT = lireLaPorteDeFusion()

export const DEPOT = "mustaphaelou/eguidar"

export const API = `https://api.github.com/repos/${DEPOT}/rulesets`

// L'ordre que l'API rend aujourd'hui, différent du contrat trié : la lecture ne
// réordonne rien, la comparaison traite les contextes comme un ensemble.
export const CONTEXTES_VIVANTS = [
  "lint",
  "format",
  "typecheck",
  "test",
  "build",
]

export type ReponseHttp = {
  statut: number
  corps: unknown
}

export function ok(corps: unknown): ReponseHttp {
  return { statut: 200, corps }
}

export function resume(
  id: number,
  nom: string,
  sourceType = "Repository"
): Record<string, unknown> {
  return {
    id,
    name: nom,
    target: "branch",
    source_type: sourceType,
    source: DEPOT,
    enforcement: "active",
    created_at: "2026-09-14T00:03:44.667+01:00",
    updated_at: "2026-09-30T10:01:36.440+01:00",
  }
}

// Les valeurs par défaut reprennent la forme du ruleset vivant : la revue n'est
// exigée par aucun de ces champs, et `require_extra_approval_for_unattributed_changes`
// est vrai sans rendre la revue requise.
export function reglePull(
  parameters: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    type: "pull_request",
    parameters: {
      allowed_merge_methods: ["merge", "squash", "rebase"],
      dismiss_stale_reviews_on_push: false,
      require_code_owner_review: false,
      require_extra_approval_for_unattributed_changes: true,
      require_last_push_approval: false,
      required_approving_review_count: 0,
      required_review_thread_resolution: false,
      required_reviewers: [],
      ...parameters,
    },
  }
}

export function regleStatuts(
  partiel: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    type: "required_status_checks",
    parameters: {
      strict_required_status_checks_policy: true,
      do_not_enforce_on_create: false,
      required_status_checks: CONTEXTES_VIVANTS.map((context) => ({ context })),
      ...partiel,
    },
  }
}

export function ruleset(
  partiel: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 23_223_443,
    node_id: "RRS_exemple",
    name: "main-protection",
    target: "branch",
    source_type: "Repository",
    source: DEPOT,
    enforcement: "active",
    conditions: {
      ref_name: { include: ["refs/heads/main"], exclude: [] },
    },
    bypass_actors: [],
    rules: [reglePull(), regleStatuts()],
    created_at: "2026-09-14T00:03:44.667+01:00",
    updated_at: "2026-09-30T10:01:36.440+01:00",
    _links: {
      self: { href: `${API}/23223443` },
      html: { href: "https://github.com/mustaphaelou/eguidar/rules/23223443" },
    },
    ...partiel,
  }
}
