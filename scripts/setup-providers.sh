#!/usr/bin/env bash

set -euo pipefail

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3); RED=$(tput setaf 1)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""
fi

TOTAL_STAGES=0

_STAGE_INDEX=0
ENV_FILE="${ENV_FILE:-.env}"
WRITTEN_ENV=()
WRITTEN_SECRET=()
SKIPPED=()

_clear() {
  [[ -t 1 ]] || return 0
  if command -v tput >/dev/null 2>&1; then tput clear; else printf '\033[2J\033[3J\033[H'; fi
}

banner() {
  _clear
  printf '\n%s%s  %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"
  printf '%s  %s stages%s\n\n' "$DIM" "$TOTAL_STAGES" "$RESET"
  printf '%s  You drive the browser; this wizard tells you exactly what to do and\n' "$DIM"
  printf '  captures the values you copy back. Stop any time with Ctrl-C and re-run\n'
  printf '  later — it remembers values already saved.%s\n' "$RESET"
  pause "Ready to start?"
}

stage() {
  _clear
  _STAGE_INDEX=$((_STAGE_INDEX + 1))
  printf '\n%s%s▸ Stage %s/%s · %s%s\n' \
    "$BOLD" "$BLUE" "$_STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"
}

say()  { printf '  %s\n' "$1"; }
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

open_url() {
  local url="$1"
  printf '  %s↗ opening%s %s\n' "$GREEN" "$RESET" "$url"
  { if   command -v wslview     >/dev/null 2>&1; then wslview "$url"
    elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$url"
    elif command -v xdg-open    >/dev/null 2>&1; then xdg-open "$url"
    elif command -v open        >/dev/null 2>&1; then open "$url"
    else warn "couldn't open a browser — visit it manually: $url"; fi
  } >/dev/null 2>&1 || warn "couldn't open a browser — visit it manually: $url"
}

pause() {
  printf '  %s%s%s ' "$DIM" "${1:-Press Enter to continue}" "$RESET"
  read -r _ || true
}

confirm() {
  local reply=""
  printf '  %s? %s [y/N] ' "$YELLOW" "$1"
  read -r reply || true
  [[ "$reply" =~ ^[Yy] ]]
}

_existing() {
  [[ -f "$ENV_FILE" ]] || return 1
  local line; line=$(grep -E "^${1}=" "$ENV_FILE" | tail -n1) || return 1
  printf '%s' "${line#*=}"
}

ask() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -r input || true
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

ask_secret() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -rs input || true
  printf '\n'
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

write_env() {
  local key="$1" value="$2" tmp
  touch "$ENV_FILE"
  tmp=$(mktemp)
  grep -vE "^${key}=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
  WRITTEN_ENV+=("$key")
  printf '  %s✓ wrote%s %s → %s\n' "$GREEN" "$RESET" "$key" "$ENV_FILE"
}

set_secret() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if printf '%s' "$value" | gh secret set "$name" >/dev/null 2>&1; then
      WRITTEN_SECRET+=("$name")
      printf '  %s✓ set%s GitHub secret %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub secret $name (set it manually: gh secret set $name)")
  warn "skipped GitHub secret $name — gh not ready; set it later"
}

set_var() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if gh variable set "$name" --body "$value" >/dev/null 2>&1; then
      printf '  %s✓ set%s GitHub variable %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub variable $name")
  warn "skipped GitHub variable $name — gh not ready; set it later"
}

finish() {
  _clear
  printf '\n%s%s  ✓ Setup complete%s\n' "$BOLD" "$GREEN" "$RESET"
  (( ${#WRITTEN_ENV[@]} ))    && note "wrote ${#WRITTEN_ENV[@]} value(s) to $ENV_FILE: ${WRITTEN_ENV[*]}"
  (( ${#WRITTEN_SECRET[@]} )) && note "set ${#WRITTEN_SECRET[@]} GitHub secret(s): ${WRITTEN_SECRET[*]}"
  if (( ${#SKIPPED[@]} )); then
    printf '\n'; warn "still to do by hand:"
    for s in "${SKIPPED[@]}"; do note "  - $s"; done
  fi
  printf '\n'
}

TOTAL_STAGES=4

banner "Eguidar provider setup"

_save() {
  local key="$1" val="$2"
  if [[ -n "$val" ]]; then
    write_env "$key" "$val"
  else
    warn "no value for $key — nothing written"
    SKIPPED+=("$key")
  fi
}

stage "Test database"
say "Restores the two test-db vars that are missing from .env."
say "Defaults match .env.example and docker-compose.yml."

ask TEST_DB_NAME "Test DB name:"
if [[ -z "$TEST_DB_NAME" ]]; then
  TEST_DB_NAME="eguidar_test"
  note "using default: $TEST_DB_NAME"
fi

ask TEST_DATABASE_URL "Test DB URL:"
if [[ -z "$TEST_DATABASE_URL" ]]; then
  _db_url=$(_existing DATABASE_URL || true)
  if [[ -n "$_db_url" ]]; then
    TEST_DATABASE_URL="${_db_url%/*}/$TEST_DB_NAME"
  else
    TEST_DATABASE_URL="postgresql://eguidar:eguidar@localhost:5433/$TEST_DB_NAME"
  fi
  note "using default: $TEST_DATABASE_URL"
fi

_save TEST_DB_NAME "$TEST_DB_NAME"
_save TEST_DATABASE_URL "$TEST_DATABASE_URL"

stage "Cloudflare Turnstile"
say "We'll create a Turnstile widget and store its two keys in .env."
open_url "https://dash.cloudflare.com/?to=/:account/turnstile"
step "Sign in to Cloudflare if asked — you should land on the Turnstile page."
step "Select 'Add widget'."
step "Widget name: e.g. eguidar (any descriptive name works)."
step "Hostnames: add localhost and 127.0.0.1 (plus eguidar.com when you deploy)."
step "Widget mode: Managed (recommended). Then select 'Create'."
step "Copy the Site Key shown after creation."
ask NEXT_PUBLIC_TURNSTILE_SITE_KEY "Paste the Site Key:"
step "Copy the Secret Key shown alongside it (keep it private)."
ask_secret TURNSTILE_SECRET_KEY "Paste the Secret Key:"
_save NEXT_PUBLIC_TURNSTILE_SITE_KEY "$NEXT_PUBLIC_TURNSTILE_SITE_KEY"
_save TURNSTILE_SECRET_KEY "$TURNSTILE_SECRET_KEY"
note ""
note "NEXT_PUBLIC_TURNSTILE_SITE_KEY is baked at build time — restart the dev"
note "server, or rebuild the Docker image (it's a build arg in docker-compose.yml)."
note "lib/auth.ts enables captcha automatically once TURNSTILE_SECRET_KEY exists."

stage "R2 lifecycle (Brouillons d'Image produit)"
say "Abandoned drafts expire through a Cloudflare R2 lifecycle rule. There is"
say "no worker and no scheduler: this rule is the only out-of-band expiry, and"
say "the registry is the only source of truth for a draft's state."

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
R2_RULES_FILE="$RACINE/infra/regle-cycle-vie-r2.json"

_r2_value() {
  node -e '
    const fs = require("node:fs")
    const artefact = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
    const valeur = process.argv[2].split(".").reduce((noeud, cle) => noeud[cle], artefact)
    process.stdout.write(String(valeur))
  ' "$R2_RULES_FILE" "$1"
}

if [[ ! -f "$R2_RULES_FILE" ]] || ! command -v node >/dev/null 2>&1; then
  warn "can't read the checked-in lifecycle artifact ($R2_RULES_FILE)"
  SKIPPED+=("R2 lifecycle rule — apply infra/regle-cycle-vie-r2.json by hand")
else
  R2_BUCKET_NAME="$(_r2_value bucket)"
  R2_RULE_PREFIX="$(_r2_value rules.0.prefix)"
  R2_RULE_DAYS="$(_r2_value rules.0.expire.days)"

  note ""
  note "Artifact: infra/regle-cycle-vie-r2.json"
  note "  bucket : $R2_BUCKET_NAME"
  note "  prefix : $R2_RULE_PREFIX"
  note "  expire : delete after $R2_RULE_DAYS day(s)"
  warn "Exactly one rule, and never an empty prefix: a global rule would"
  warn "expire the persisted Images produit of the Catalogue."
  R2_ENV_BUCKET="$(_existing R2_BUCKET || true)"
  R2_BUCKET_DIVERGE=0
  if [[ -n "$R2_ENV_BUCKET" && "$R2_ENV_BUCKET" != "$R2_BUCKET_NAME" ]]; then
    R2_BUCKET_DIVERGE=1
    warn "R2_BUCKET in $ENV_FILE is '$R2_ENV_BUCKET' while the artifact targets"
    warn "'$R2_BUCKET_NAME'. Applying would configure the wrong bucket — the"
    warn "application reads R2_BUCKET, the artifact is versioned. Edit"
    warn "infra/regle-cycle-vie-r2.json, or fix R2_BUCKET in $ENV_FILE."
  fi
  note ""
  note "Prefer the dashboard? The same rule is one form there:"
  open_url "https://dash.cloudflare.com/?to=/:account/r2/buckets/$R2_BUCKET_NAME/settings"
  step "Settings → Object lifecycle → Add rule, with the prefix and delay above."

  step "Create a Cloudflare API token with 'Workers R2 Storage: Edit' for this"
  step "account (My Profile → API Tokens → Create Token). It is stored only in"
  step "$ENV_FILE and never leaves this machine."
  ask_secret CLOUDFLARE_API_TOKEN "Paste the API token:"
  _save CLOUDFLARE_API_TOKEN "$CLOUDFLARE_API_TOKEN"
  ask R2_ACCOUNT_ID "Cloudflare account ID:"
  _save R2_ACCOUNT_ID "$R2_ACCOUNT_ID"

  R2_LIFECYCLE_URL="https://api.cloudflare.com/client/v4/accounts/$R2_ACCOUNT_ID/r2/buckets/$R2_BUCKET_NAME/lifecycle"

  _r2_apply() {
    local corps
    corps="$(node -e '
      const fs = require("node:fs")
      const artefact = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
      process.stdout.write(JSON.stringify({ rules: artefact.rules }))
    ' "$R2_RULES_FILE")"
    curl -sS -X PUT "$R2_LIFECYCLE_URL" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data-binary "$corps"
  }

  _r2_regles_etrangeres() {
    local vivant
    vivant="$(curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      "$R2_LIFECYCLE_URL")" || return 1
    printf '%s' "$vivant" | node -e '
      const fs = require("node:fs")
      const artefact = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
      const lu = JSON.parse(fs.readFileSync(0, "utf8"))
      const regles = (lu.result ?? lu).rules
      if (lu.success === false || !Array.isArray(regles)) {
        console.error("lecture impossible : " + JSON.stringify(lu.errors ?? lu).slice(0, 200))
        process.exitCode = 1
      } else {
        const connues = artefact.rules.map((r) => JSON.stringify(r)).join("\n")
        const etrangeres = regles.filter(
          (r) => !connues.includes(JSON.stringify(r))
        )
        for (const r of etrangeres) console.log("    " + JSON.stringify(r))
        process.stdout.write(String(etrangeres.length))
      }
    ' "$R2_RULES_FILE"
  }

  _r2_verify() {
    local vivant
    vivant="$(curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      "$R2_LIFECYCLE_URL")" || {
      warn "could not read the live lifecycle — check the token and R2_ACCOUNT_ID"
      return 1
    }
    printf '%s' "$vivant" | node -e '
      const fs = require("node:fs")
      const attendu = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).rules
      const lu = JSON.parse(fs.readFileSync(0, "utf8"))
      const observe = (lu.result ?? lu).rules ?? null
      if (JSON.stringify(attendu) === JSON.stringify(observe)) {
        console.log("  live rules match the artifact")
      } else {
        console.log("  live rules differ from the artifact")
        console.log("  expected: " + JSON.stringify(attendu))
        console.log("  observed: " + JSON.stringify(observe))
        process.exitCode = 1
      }
    ' "$R2_RULES_FILE"
  }

  if [[ -z "$R2_ACCOUNT_ID" || -z "$CLOUDFLARE_API_TOKEN" ]]; then
    warn "no R2_ACCOUNT_ID or CLOUDFLARE_API_TOKEN — the rule cannot be applied"
    warn "or verified here; add the rule from the dashboard instead"
    SKIPPED+=("R2 lifecycle rule (needs R2_ACCOUNT_ID and CLOUDFLARE_API_TOKEN)")
  elif ! command -v curl >/dev/null 2>&1; then
    warn "curl is missing — apply the rule from the dashboard instead"
    SKIPPED+=("R2 lifecycle rule verification (no curl)")
  elif [[ "$R2_BUCKET_DIVERGE" -eq 1 ]]; then
    warn "bucket mismatch — nothing was applied, so the wrong bucket is never"
    warn "configured. Reconcile R2_BUCKET and the artifact, then re-run."
    SKIPPED+=("R2 lifecycle rule (bucket mismatch)")
  elif confirm "Apply the rule to bucket $R2_BUCKET_NAME now?"; then
    R2_ETRANGERES="$(_r2_regles_etrangeres 2>/dev/null || true)"
    R2_NOMBRE="${R2_ETRANGERES##*$'\n'}"
    if ! [[ "$R2_NOMBRE" =~ ^[0-9]+$ ]]; then
      warn "could not read the live rules — nothing was applied. Check the token"
      warn "and R2_ACCOUNT_ID, or add the rule from the dashboard instead."
      SKIPPED+=("R2 lifecycle rule (live rules unreadable)")
    elif [[ "$R2_NOMBRE" -gt 0 ]]; then
      warn "This bucket already has $R2_NOMBRE rule(s) the artifact does not"
      warn "describe. The API replaces the whole set, so applying DELETES them:"
      printf '%s\n' "${R2_ETRANGERES%$'\n'*}"
      if ! confirm "Delete those rules and leave only the artifact's rule?"; then
        warn "nothing was applied. Add the rule from the dashboard instead, so"
        warn "the other rules survive."
        SKIPPED+=("R2 lifecycle rule (would delete existing bucket rules)")
      else
        _r2_apply || warn "the API call failed — check the token and R2_ACCOUNT_ID"
      fi
    else
      _r2_apply || warn "the API call failed — check the token and R2_ACCOUNT_ID"
    fi
    pause "Press Enter to verify the live rules against the artifact."
    if _r2_verify; then
      printf '  %s✓ R2 lifecycle rule applied and verified%s\n' "$GREEN" "$RESET"
    else
      warn "live configuration still differs from the artifact"
      SKIPPED+=("R2 lifecycle rule verification")
    fi
  else
    SKIPPED+=("R2 lifecycle rule not applied — re-run this stage")
  fi
  note ""
  note "The rule must carry the same retention as RETENTION_BROUILLON_IMAGE_PRODUIT_H"
  note "(24 h by default). A shorter rule deletes the file of a draft the"
  note "application still considers claimable; a longer one only leaves orphan"
  note "bytes behind, because the registry refuses the claim either way."
fi

stage "Cache Rules (Documents à l'edge)"
say "Cloudflare becomes eligible to store the anonymous documents at the edge."
say "Two rules, in this order: an RSC or Next-Router-Prefetch request bypasses"
say "the cache, then storefront HTML is cache-eligible. No /_next/image rule is"
say "added: images are a separate ticket."

RACINE="${RACINE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CACHE_RULES_FILE="$RACINE/infra/regle-cache-edge.json"

_cache_valeur() {
  node -e '
    const fs = require("node:fs")
    const artefact = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
    const valeur = process.argv[2].split(".").reduce((noeud, cle) => noeud[cle], artefact)
    process.stdout.write(String(valeur))
  ' "$CACHE_RULES_FILE" "$1"
}

_cache_corps() {
  node -e '
    const fs = require("node:fs")
    const artefact = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
    process.stdout.write(JSON.stringify({ rules: artefact.rules }))
  ' "$CACHE_RULES_FILE"
}

_cache_erreurs() {
  node -e '
    let lu
    try {
      lu = JSON.parse(require("node:fs").readFileSync(0, "utf8"))
    } catch {
      console.error("réponse illisible de l’API")
      process.exit(1)
    }
    if (lu.success === false) {
      const messages = (lu.errors ?? []).map((erreur) => erreur.message).filter(Boolean)
      console.error(messages.join("; ") || JSON.stringify(lu))
      process.exit(1)
    }
  '
}

_cache_lire() {
  local reponse code
  reponse="$(curl -sS -w $'\n%{http_code}' \
    -H "Authorization: Bearer $CACHE_TOKEN" \
    "$CACHE_ENTRYPOINT")" || return 1
  code="${reponse##*$'\n'}"
  CACHE_CODE="$code"
  CACHE_CORPS="${reponse%$'\n'*}"
  CACHE_ID="$(printf '%s' "$CACHE_CORPS" | node -e '
    try {
      const lu = JSON.parse(require("node:fs").readFileSync(0, "utf8"))
      const id = lu?.result?.id
      if (typeof id === "string" && id !== "") process.stdout.write(id)
    } catch {}
  ')"
}

_cache_vide() {
  [[ "$CACHE_CODE" =~ ^4[0-9][0-9]$ ]]
}

_cache_etrangeres() {
  _cache_lire || return 1
  if _cache_vide; then
    printf '0'
    return 0
  fi
  printf '%s' "$CACHE_CORPS" | node -e '
    const fs = require("node:fs")
    const artefact = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
    let lu
    try {
      lu = JSON.parse(fs.readFileSync(0, "utf8"))
    } catch {
      console.error("réponse illisible")
      process.exit(1)
    }
    if (lu.success === false) {
      console.error("lecture impossible : " + JSON.stringify(lu.errors ?? lu).slice(0, 200))
      process.exit(1)
    }
    const regles = lu?.result?.rules
    if (!Array.isArray(regles)) {
      console.error("règles absentes de la réponse")
      process.exit(1)
    }
    const projeter = (regle) => ({
      ref: regle.ref,
      description: regle.description,
      enabled: regle.enabled,
      expression: regle.expression,
      action: regle.action,
      action_parameters: regle.action_parameters,
    })
    const attendues = artefact.rules.map(projeter)
    const etrangeres = regles.filter(
      (regle) =>
        !attendues.some(
          (attendue) =>
            JSON.stringify(attendue) === JSON.stringify(projeter(regle))
        )
    )
    for (const regle of etrangeres) console.log("    " + JSON.stringify(regle))
    process.stdout.write(String(etrangeres.length))
  ' "$CACHE_RULES_FILE"
}

_cache_put() {
  local url="$1" corps="$2"
  curl -sS -X PUT "$url" \
    -H "Authorization: Bearer $CACHE_TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary "$corps"
}

_cache_verifier() {
  if ! _cache_lire; then
    warn "could not read the live cache rules back"
    return 1
  fi
  if _cache_vide; then
    warn "the phase entrypoint still answers $CACHE_CODE after the PUT"
    return 1
  fi
  printf '%s' "$CACHE_CORPS" | node -e '
    const fs = require("node:fs")
    const attendues = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).rules
    let lu
    try {
      lu = JSON.parse(fs.readFileSync(0, "utf8"))
    } catch {
      console.error("réponse illisible")
      process.exit(1)
    }
    if (lu.success === false) {
      console.error("lecture impossible : " + JSON.stringify(lu.errors ?? lu).slice(0, 200))
      process.exit(1)
    }
    const observees = (lu?.result?.rules ?? []).map((regle) => ({
      ref: regle.ref,
      description: regle.description,
      enabled: regle.enabled,
      expression: regle.expression,
      action: regle.action,
      action_parameters: regle.action_parameters,
    }))
    if (JSON.stringify(attendues) === JSON.stringify(observees)) {
      console.log("  live cache rules match the artifact")
    } else {
      console.log("  live cache rules differ from the artifact")
      console.log("  expected: " + JSON.stringify(attendues))
      console.log("  observed: " + JSON.stringify(observees))
      process.exitCode = 1
    }
  ' "$CACHE_RULES_FILE"
}

_cache_revert() {
  local id="${CACHE_ID:-<ruleset-id>}"
  note ""
  note "Revert in one call — delete the phase ruleset (all versions):"
  note "  curl -sS -X DELETE \"https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/rulesets/$id\" \\"
  note "    -H \"Authorization: Bearer \$CLOUDFLARE_API_TOKEN\""
  note "or keep it and empty it:"
  note "  curl -sS -X PUT \"$CACHE_ENTRYPOINT\" \\"
  note "    -H \"Authorization: Bearer \$CLOUDFLARE_API_TOKEN\" \\"
  note "    -H \"Content-Type: application/json\" --data-binary '{\"rules\":[]}'"
}

_cache_appliquer() {
  local corps reponse
  corps="$(_cache_corps)"

  note "Dry run: validating the ruleset without writing…"
  reponse="$(_cache_put "$CACHE_ENTRYPOINT?dry_run=true" "$corps")" || {
    warn "the dry-run call failed — check the token and zone ID"
    SKIPPED+=("Cache Rules (dry run failed)")
    return 0
  }
  if ! printf '%s' "$reponse" | _cache_erreurs; then
    warn "the API rejected the ruleset — nothing was written"
    SKIPPED+=("Cache Rules (dry run rejected)")
    return 0
  fi

  note "Dry run accepted. Writing the ruleset…"
  reponse="$(_cache_put "$CACHE_ENTRYPOINT" "$corps")" || {
    warn "the PUT failed — check the token and zone ID"
    SKIPPED+=("Cache Rules (PUT failed)")
    return 0
  }
  if ! printf '%s' "$reponse" | _cache_erreurs; then
    warn "the API rejected the ruleset — check the response above"
    SKIPPED+=("Cache Rules (PUT rejected)")
    return 0
  fi

  note "Reading the live ruleset back — the API adds id, version and last_updated."
  if _cache_verifier; then
    printf '  %s✓ Cache rules applied and verified%s\n' "$GREEN" "$RESET"
  else
    warn "live configuration still differs from the artifact"
    SKIPPED+=("Cache Rules verification")
  fi
  _cache_revert
  return 0
}

if [[ ! -f "$CACHE_RULES_FILE" ]] || ! command -v node >/dev/null 2>&1; then
  warn "can't read the checked-in cache rules artifact ($CACHE_RULES_FILE)"
  SKIPPED+=("Cache Rules — apply infra/regle-cache-edge.json by hand")
else
  CACHE_PHASE="$(_cache_valeur phase)"
  CACHE_HOST="$(_cache_valeur zone)"
  CACHE_REFS="$(node -e '
    const fs = require("node:fs")
    const artefact = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
    process.stdout.write(artefact.rules.map((regle) => regle.ref).join(", "))
  ' "$CACHE_RULES_FILE")"

  note ""
  note "Artifact: infra/regle-cache-edge.json"
  note "  phase : $CACHE_PHASE"
  note "  zone  : $CACHE_HOST"
  note "  rules : $CACHE_REFS"
  warn "Cache Rules stack, and the LAST matching rule wins for a setting: the"
  warn "bypass rule alone is not enough, so the eligible rule negates RSC and"
  warn "Next-Router-Prefetch itself. The artifact and its test pin that."
  warn "A PUT replaces the WHOLE phase ruleset: rules the artifact does not"
  warn "describe are deleted. This step lists them and asks a second time."
  note ""
  note "The eligible rule uses edge_ttl 'bypass_by_default': s-maxage is"
  note "honoured, and a response without Cache-Control is not stored. A"
  note "response carrying Set-Cookie is kept and not cached, as long as the"
  note "artifact never sets override_origin or status_code_ttl."
  note ""
  note "Prefer the dashboard? Create the two rules in this order, with the"
  note "expressions from the artifact:"
  open_url "https://dash.cloudflare.com/?to=/:account/$CACHE_HOST/caching/cache-rules"
  step "Rule 1: bypass cache when RSC or Next-Router-Prefetch is present."
  step "Rule 2: eligible for cache, Edge TTL 'Bypass cache by default',"
  step "        excluding /api/, /_next/ and the two RSC/prefetch headers."
  step "Do not add a /_next/image rule: images are a separate ticket."
  note ""
  note "The token needs 'Zone > Cache Rules > Edit'. The R2 token may only"
  note "have 'Workers R2 Storage: Edit' — widen it, or use a second token."

  CACHE_TOKEN="${CLOUDFLARE_API_TOKEN:-$(_existing CLOUDFLARE_API_TOKEN || true)}"
  if [[ -z "$CACHE_TOKEN" ]]; then
    step "Create a Cloudflare API token with 'Zone > Cache Rules > Edit' (widen"
    step "the R2 token, or create a second token). It is stored only in"
    step "$ENV_FILE and never leaves this machine."
    ask_secret CLOUDFLARE_API_TOKEN "Paste the API token:"
    _save CLOUDFLARE_API_TOKEN "$CLOUDFLARE_API_TOKEN"
    CACHE_TOKEN="$CLOUDFLARE_API_TOKEN"
  fi
  ask CLOUDFLARE_ZONE_ID "Cloudflare zone ID:"
  _save CLOUDFLARE_ZONE_ID "$CLOUDFLARE_ZONE_ID"

  CACHE_ENTRYPOINT="https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/rulesets/phases/$CACHE_PHASE/entrypoint"

  if [[ -z "$CACHE_TOKEN" || -z "$CLOUDFLARE_ZONE_ID" ]]; then
    warn "no CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID — nothing was sent to the zone"
    SKIPPED+=("Cache Rules (needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID)")
  elif ! command -v curl >/dev/null 2>&1; then
    warn "curl is missing — apply the rules from the dashboard instead"
    SKIPPED+=("Cache Rules (no curl)")
  elif confirm "Apply the cache rules to zone $CLOUDFLARE_ZONE_ID now?"; then
    CACHE_ETRANGERES="$(_cache_etrangeres 2>/dev/null || true)"
    CACHE_NOMBRE="${CACHE_ETRANGERES##*$'\n'}"
    if ! [[ "$CACHE_NOMBRE" =~ ^[0-9]+$ ]]; then
      warn "could not read the live cache rules — nothing was applied. Check"
      warn "the token (Zone > Cache Rules > Edit) and the zone ID."
      SKIPPED+=("Cache Rules (live rules unreadable)")
    elif [[ "$CACHE_NOMBRE" -gt 0 ]]; then
      warn "This phase already has $CACHE_NOMBRE rule(s) the artifact does not"
      warn "describe. A PUT replaces the whole set, so applying DELETES them:"
      printf '%s\n' "${CACHE_ETRANGERES%$'\n'*}"
      if confirm "Replace those foreign cache rules and leave only the artifact's rules?"; then
        _cache_appliquer
      else
        warn "nothing was applied. Edit the artifact to describe them, or add"
        warn "the rules from the dashboard so they survive."
        SKIPPED+=("Cache Rules (would delete existing phase rules)")
      fi
    else
      _cache_appliquer
    fi
  else
    SKIPPED+=("Cache Rules not applied — re-run this stage")
  fi
fi

finish
