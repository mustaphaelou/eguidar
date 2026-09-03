// PROTOTYPE — Three variants of the login page, switchable via ?variant=, on /prototype/connexion.
// Throwaway code to answer: "What should the Eguidar login page look like?"
// Do not build on this file; the winning variant gets folded into the canonical route.

"use client"

import { useState } from "react"
import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AppleIcon,
  GoogleIcon,
  Cash01Icon,
  DeliveryTruck02Icon,
  Shield01Icon,
  UserIcon,
  Loading03Icon,
  ArrowLeft01Icon,
  SparklesIcon,
  Invoice01Icon,
  PackageIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/auth/password-input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { site, logoBrand } from "@/lib/site"
import { cn } from "@/lib/utils"

export interface PrototypeLoginState {
  email: string
  password: string
  rememberMe: boolean
  orderId?: string
  phone?: string
  otp?: string
  activeTab?: string
  statusMessage?: string
  isLoading: boolean
}

/* =========================================================================
   VARIANT A — Éditorial Split & Réassurance
   Full-bleed 50/50 split on desktop: deep obsidian Moroccan brand showcase
   on the left with reassurance pillars, clean auth card on the right.
   ========================================================================= */

export function LoginVariantA({
  state,
  onChange,
  onSubmit,
}: {
  state: PrototypeLoginState
  onChange: (patch: Partial<PrototypeLoginState>) => void
  onSubmit: () => void
}) {
  return (
    <div className="flex min-h-svh w-full flex-col lg:flex-row">
      {/* Left Column — Brand & Trust Pillars */}
      <div className="relative flex flex-col justify-between bg-[#0e0e10] p-8 text-white sm:p-12 lg:w-1/2 lg:p-16">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="group flex items-baseline gap-0.5 text-xl font-bold tracking-tight"
          >
            <span>{logoBrand.base}</span>
            <span className="text-[#2997ff]">{logoBrand.accent}</span>
          </Link>
          <Badge
            variant="outline"
            className="border-white/20 text-xs text-white/90"
          >
            Boutique Officielle Maroc
          </Badge>
        </div>

        {/* Center Editorial Showcase */}
        <div className="my-12 flex flex-col gap-8 lg:my-0">
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              L&apos;expérience tech de référence au Maroc.
            </h1>
            <p className="text-base text-white/70 sm:text-lg">
              Smartphones, ordinateurs, audio et gaming. Retrouvez vos
              commandes, suivez vos livraisons en direct et profitez d&apos;un
              service après-vente dédié.
            </p>
          </div>

          {/* Reassurance Stack */}
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#2997ff]">
                <HugeiconsIcon icon={Cash01Icon} className="size-5" />
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-white">
                  Paiement à la livraison
                </p>
                <p className="text-xs text-white/60">
                  Réglez en espèces auprès du livreur uniquement après
                  vérification de votre colis.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#2997ff]">
                <HugeiconsIcon icon={DeliveryTruck02Icon} className="size-5" />
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-white">
                  Livraison express 24h/48h
                </p>
                <p className="text-xs text-white/60">
                  Casablanca, Rabat, Marrakech, Tanger et dans toutes les villes
                  du Royaume.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#2997ff]">
                <HugeiconsIcon icon={Shield01Icon} className="size-5" />
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-white">
                  Garantie 100% officielle
                </p>
                <p className="text-xs text-white/60">
                  Matériel neuf, scellé sous emballage constructeur avec facture
                  TTC 20%.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Social Proof */}
        <div className="flex items-center justify-between border-t border-white/10 pt-6 text-xs text-white/60">
          <span>+15 000 clients livrés avec succès</span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-400" />
            Support client WhatsApp 6j/7
          </span>
        </div>
      </div>

      {/* Right Column — Authentication Console */}
      <div className="flex flex-1 items-center justify-center bg-background p-6 sm:p-12 lg:p-16">
        <div className="flex w-full max-w-md flex-col gap-8">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="group flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon
                icon={ArrowLeft01Icon}
                className="size-3.5 transition-transform group-hover:-translate-x-0.5"
              />
              Retour à l&apos;accueil
            </Link>
            <Link
              href="/contact"
              className="text-xs text-muted-foreground hover:underline"
            >
              Besoin d&apos;aide ?
            </Link>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Bon retour parmi nous
            </h2>
            <p className="text-sm text-muted-foreground">
              Connectez-vous pour retrouver vos commandes et vos devis
              enregistrés.
            </p>
          </div>

          {/* Social Quick Login */}
          <div className="flex flex-col gap-2.5">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-center"
              onClick={() =>
                onChange({
                  statusMessage: "Simulation connexion Apple...",
                  isLoading: false,
                })
              }
            >
              <HugeiconsIcon icon={AppleIcon} data-icon="inline-start" />
              Continuer avec Apple
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-center"
              onClick={() =>
                onChange({
                  statusMessage: "Simulation connexion Google...",
                  isLoading: false,
                })
              }
            >
              <HugeiconsIcon icon={GoogleIcon} data-icon="inline-start" />
              Continuer avec Google
            </Button>
          </div>

          <FieldSeparator>ou avec votre e-mail</FieldSeparator>

          {/* Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              onSubmit()
            }}
            noValidate
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="split-email">Adresse e-mail</FieldLabel>
                <Input
                  id="split-email"
                  type="email"
                  autoComplete="email"
                  placeholder="nom@exemple.ma"
                  value={state.email}
                  onChange={(e) =>
                    onChange({
                      email: e.target.value,
                      statusMessage: undefined,
                    })
                  }
                />
              </Field>

              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="split-password">Mot de passe</FieldLabel>
                  <Link
                    href="/mot-de-passe-oublie"
                    className="text-xs text-muted-foreground hover:text-primary hover:underline"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
                <PasswordInput
                  id="split-password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={state.password}
                  onChange={(e) =>
                    onChange({
                      password: e.target.value,
                      statusMessage: undefined,
                    })
                  }
                />
              </Field>

              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <Switch
                    id="split-remember"
                    size="sm"
                    checked={state.rememberMe}
                    onCheckedChange={(checked) =>
                      onChange({ rememberMe: checked })
                    }
                  />
                  <label
                    htmlFor="split-remember"
                    className="cursor-pointer text-xs text-muted-foreground"
                  >
                    Rester connecté sur cet appareil
                  </label>
                </div>
              </div>

              {state.statusMessage && (
                <div className="rounded-lg bg-primary/10 p-3 text-xs font-medium text-primary">
                  {state.statusMessage}
                </div>
              )}

              <Field>
                <Button
                  type="submit"
                  disabled={state.isLoading}
                  className="h-10 w-full"
                >
                  {state.isLoading && (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  )}
                  {state.isLoading
                    ? "Connexion en cours…"
                    : "Se connecter à mon compte"}
                </Button>
              </Field>
            </FieldGroup>
          </form>

          <div className="flex flex-col items-center gap-3 border-t border-border pt-4 text-center">
            <p className="text-xs text-muted-foreground">
              Pas encore de compte client ?{" "}
              <Link
                href="/?open=signup"
                className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
              >
                Créer un compte
              </Link>
            </p>
            <p className="text-[11px] text-muted-foreground/80">
              Paiement à la livraison — aucun numéro de carte bancaire requis.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* =========================================================================
   VARIANT B — Minimaliste Apple Card
   Refined, distraction-free centered card with Apple aesthetic,
   typography-first hierarchy and direct guest order tracking link.
   ========================================================================= */

export function LoginVariantB({
  state,
  onChange,
  onSubmit,
}: {
  state: PrototypeLoginState
  onChange: (patch: Partial<PrototypeLoginState>) => void
  onSubmit: () => void
}) {
  return (
    <div className="flex min-h-svh w-full flex-col justify-between bg-muted/20 px-4 py-8 sm:py-12">
      {/* Top Bar with Centered Logo */}
      <div className="flex items-center justify-center">
        <Link
          href="/"
          className="group flex items-baseline gap-0.5 text-2xl font-bold tracking-tight"
        >
          <span>{logoBrand.base}</span>
          <span className="text-primary">{logoBrand.accent}</span>
        </Link>
      </div>

      {/* Main Centered Card Container */}
      <div className="my-auto flex w-full max-w-md flex-col gap-4 self-center">
        <Card className="border border-border/80 shadow-sm">
          <CardHeader className="items-center gap-2 pb-2 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <HugeiconsIcon icon={UserIcon} className="size-5" />
            </div>
            <CardTitle className="text-xl font-semibold sm:text-2xl">
              Compte Eguidar
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Un seul compte pour retrouver vos commandes, devis et factures
              avec TVA.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                onSubmit()
              }}
              noValidate
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="card-email">E-mail</FieldLabel>
                  <Input
                    id="card-email"
                    type="email"
                    placeholder="nom@exemple.ma"
                    value={state.email}
                    onChange={(e) =>
                      onChange({
                        email: e.target.value,
                        statusMessage: undefined,
                      })
                    }
                  />
                </Field>

                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="card-password">
                      Mot de passe
                    </FieldLabel>
                    <Link
                      href="/mot-de-passe-oublie"
                      className="text-xs text-muted-foreground hover:text-primary hover:underline"
                    >
                      Oublié ?
                    </Link>
                  </div>
                  <PasswordInput
                    id="card-password"
                    placeholder="••••••••"
                    value={state.password}
                    onChange={(e) =>
                      onChange({
                        password: e.target.value,
                        statusMessage: undefined,
                      })
                    }
                  />
                </Field>

                <div className="flex items-center justify-between py-0.5">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="card-remember"
                      size="sm"
                      checked={state.rememberMe}
                      onCheckedChange={(checked) =>
                        onChange({ rememberMe: checked })
                      }
                    />
                    <label
                      htmlFor="card-remember"
                      className="cursor-pointer text-xs text-muted-foreground"
                    >
                      Rester connecté
                    </label>
                  </div>
                </div>

                {state.statusMessage && (
                  <div className="rounded-lg bg-primary/10 p-2.5 text-center text-xs font-medium text-primary">
                    {state.statusMessage}
                  </div>
                )}

                <Field>
                  <Button
                    type="submit"
                    disabled={state.isLoading}
                    className="h-10 w-full rounded-full"
                  >
                    {state.isLoading && (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        data-icon="inline-start"
                        className="animate-spin"
                      />
                    )}
                    {state.isLoading ? "Connexion…" : "Continuer"}
                  </Button>
                </Field>
              </FieldGroup>
            </form>

            <FieldSeparator>ou continuer avec</FieldSeparator>

            <div className="grid grid-cols-2 gap-2.5">
              <Button
                type="button"
                variant="outline"
                className="h-9 justify-center text-xs"
                onClick={() =>
                  onChange({
                    statusMessage: "Connexion Apple simulée",
                    isLoading: false,
                  })
                }
              >
                <HugeiconsIcon icon={AppleIcon} data-icon="inline-start" />
                Apple
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 justify-center text-xs"
                onClick={() =>
                  onChange({
                    statusMessage: "Connexion Google simulée",
                    isLoading: false,
                  })
                }
              >
                <HugeiconsIcon icon={GoogleIcon} data-icon="inline-start" />
                Google
              </Button>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-2 border-t border-border/60 pt-4 text-center">
            <p className="text-xs text-muted-foreground">
              Pas encore de compte ?{" "}
              <Link
                href="/?open=signup"
                className="font-medium text-foreground underline hover:text-primary"
              >
                Créer mon compte
              </Link>
            </p>
          </CardFooter>
        </Card>

        {/* Secondary Card — Order Tracking without credentials */}
        <Card
          size="sm"
          className="border-border/60 bg-card/60 transition-colors hover:bg-card"
        >
          <CardContent className="flex items-center justify-between p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                <HugeiconsIcon icon={PackageIcon} className="size-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium">
                  Vous avez commandé en visiteur ?
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Suivez votre livraison sans mot de passe
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              size="xs"
              className="rounded-full"
              render={<Link href="/commandes" />}
            >
              Suivre ›
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Footer legal & links */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-center text-xs text-muted-foreground">
        <Link
          href="/conditions"
          className="hover:text-foreground hover:underline"
        >
          Conditions & livraison
        </Link>
        <span>•</span>
        <Link href="/faq" className="hover:text-foreground hover:underline">
          Questions fréquentes
        </Link>
        <span>•</span>
        <a
          href={`https://wa.me/${site.contactPhoneDigits}`}
          target="_blank"
          rel="noreferrer"
          className="text-emerald-600 hover:underline dark:text-emerald-400"
        >
          Assistance WhatsApp
        </a>
      </div>
    </div>
  )
}

/* =========================================================================
   VARIANT C — Hub Client & Suivi Express
   Dual-intent customer portal: direct switcher between Account Login,
   Instant OTP Code login, and Express Order Tracking by Phone + Order ID.
   ========================================================================= */

export function LoginVariantC({
  state,
  onChange,
  onSubmit,
}: {
  state: PrototypeLoginState
  onChange: (patch: Partial<PrototypeLoginState>) => void
  onSubmit: () => void
}) {
  const currentTab = state.activeTab ?? "login"

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col justify-center px-4 py-8 sm:px-6 sm:py-12">
      {/* Top Banner */}
      <div className="mb-6 flex flex-col items-center justify-between gap-4 border-b border-border pb-6 text-center sm:flex-row sm:text-start">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-baseline gap-0.5 text-2xl font-bold tracking-tight"
          >
            <span>{logoBrand.base}</span>
            <span className="text-primary">{logoBrand.accent}</span>
          </Link>
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <p className="text-xs text-muted-foreground sm:text-sm">
            Espace Client & Suivi des commandes
          </p>
        </div>
        <Badge
          variant="secondary"
          className="flex items-center gap-1 px-3 py-1"
        >
          <HugeiconsIcon
            icon={SparklesIcon}
            className="size-3 text-amber-500"
          />
          <span>Boutique certifiée Maroc</span>
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column — Multi-intent Console (8 cols) */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          <Card className="border border-border/80 shadow-sm">
            {/* Segmented Control Tabs */}
            <div className="border-b border-border p-2">
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1 text-center text-xs font-medium">
                <button
                  type="button"
                  onClick={() =>
                    onChange({ activeTab: "login", statusMessage: undefined })
                  }
                  className={cn(
                    "rounded-lg py-2 transition-all",
                    currentTab === "login"
                      ? "bg-background font-semibold text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Connexion
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange({ activeTab: "otp", statusMessage: undefined })
                  }
                  className={cn(
                    "rounded-lg py-2 transition-all",
                    currentTab === "otp"
                      ? "bg-background font-semibold text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Code express
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      activeTab: "tracking",
                      statusMessage: undefined,
                    })
                  }
                  className={cn(
                    "rounded-lg py-2 transition-all",
                    currentTab === "tracking"
                      ? "bg-background font-semibold text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Suivi commande
                </button>
              </div>
            </div>

            {/* TAB 1: Password Login */}
            {currentTab === "login" && (
              <CardContent className="flex flex-col gap-5 pt-6">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold">
                    Identifiants de compte
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Connectez-vous avec votre adresse e-mail et mot de passe.
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    onSubmit()
                  }}
                  noValidate
                >
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="hub-email">
                        Adresse e-mail
                      </FieldLabel>
                      <Input
                        id="hub-email"
                        type="email"
                        placeholder="nom@exemple.ma"
                        value={state.email}
                        onChange={(e) =>
                          onChange({
                            email: e.target.value,
                            statusMessage: undefined,
                          })
                        }
                      />
                    </Field>

                    <Field>
                      <div className="flex items-center justify-between">
                        <FieldLabel htmlFor="hub-password">
                          Mot de passe
                        </FieldLabel>
                        <Link
                          href="/mot-de-passe-oublie"
                          className="text-xs text-muted-foreground hover:text-primary hover:underline"
                        >
                          Mot de passe oublié ?
                        </Link>
                      </div>
                      <PasswordInput
                        id="hub-password"
                        placeholder="••••••••"
                        value={state.password}
                        onChange={(e) =>
                          onChange({
                            password: e.target.value,
                            statusMessage: undefined,
                          })
                        }
                      />
                    </Field>

                    {state.statusMessage && (
                      <div className="rounded-lg bg-primary/10 p-2.5 text-xs font-medium text-primary">
                        {state.statusMessage}
                      </div>
                    )}

                    <Field>
                      <Button
                        type="submit"
                        disabled={state.isLoading}
                        className="h-10 w-full"
                      >
                        {state.isLoading && (
                          <HugeiconsIcon
                            icon={Loading03Icon}
                            data-icon="inline-start"
                            className="animate-spin"
                          />
                        )}
                        {state.isLoading ? "Connexion…" : "Se connecter"}
                      </Button>
                    </Field>
                  </FieldGroup>
                </form>

                <FieldSeparator>ou</FieldSeparator>

                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-center text-xs"
                    onClick={() =>
                      onChange({
                        statusMessage: "Simulation connexion Apple...",
                        isLoading: false,
                      })
                    }
                  >
                    <HugeiconsIcon icon={AppleIcon} data-icon="inline-start" />
                    Continuer avec Apple
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-center text-xs"
                    onClick={() =>
                      onChange({
                        statusMessage: "Simulation connexion Google...",
                        isLoading: false,
                      })
                    }
                  >
                    <HugeiconsIcon icon={GoogleIcon} data-icon="inline-start" />
                    Continuer avec Google
                  </Button>
                </div>
              </CardContent>
            )}

            {/* TAB 2: One-time Code (OTP) */}
            {currentTab === "otp" && (
              <CardContent className="flex flex-col gap-5 pt-6">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold">
                    Connexion sans mot de passe
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Recevez un code temporaire à 6 chiffres par e-mail ou
                    WhatsApp.
                  </p>
                </div>

                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="otp-email">
                      Adresse e-mail ou téléphone
                    </FieldLabel>
                    <Input
                      id="otp-email"
                      type="text"
                      placeholder="nom@exemple.ma ou 06 61 23 45 67"
                      value={state.email}
                      onChange={(e) => onChange({ email: e.target.value })}
                    />
                  </Field>

                  <Field>
                    <Button
                      type="button"
                      variant="default"
                      className="h-10 w-full"
                      onClick={() =>
                        onChange({
                          statusMessage:
                            "Code de vérification envoyé ! (Simulation : 482910)",
                        })
                      }
                    >
                      Envoyer le code temporaire
                    </Button>
                  </Field>

                  {state.statusMessage && (
                    <div className="rounded-lg bg-emerald-500/10 p-3 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      {state.statusMessage}
                    </div>
                  )}

                  <Field>
                    <FieldLabel htmlFor="otp-input">Code reçu</FieldLabel>
                    <Input
                      id="otp-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={state.otp ?? ""}
                      onChange={(e) => onChange({ otp: e.target.value })}
                    />
                  </Field>

                  <Field>
                    <Button
                      type="button"
                      disabled={!state.otp || state.otp.length < 6}
                      className="h-10 w-full"
                      onClick={() =>
                        onChange({
                          statusMessage: "Code validé ! Bienvenue sur Eguidar.",
                        })
                      }
                    >
                      Valider et continuer
                    </Button>
                  </Field>
                </FieldGroup>
              </CardContent>
            )}

            {/* TAB 3: Guest Order Tracking */}
            {currentTab === "tracking" && (
              <CardContent className="flex flex-col gap-5 pt-6">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold">
                    Suivre une commande sans compte
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Idéal pour les commandes passées en Paiement à la livraison.
                  </p>
                </div>

                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="track-order">
                      N° de commande
                    </FieldLabel>
                    <Input
                      id="track-order"
                      placeholder="ex: EGD-2026-8941"
                      value={state.orderId ?? ""}
                      onChange={(e) => onChange({ orderId: e.target.value })}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="track-phone">
                      N° de téléphone renseigné
                    </FieldLabel>
                    <Input
                      id="track-phone"
                      type="tel"
                      placeholder="ex: 06 61 23 45 67"
                      value={state.phone ?? ""}
                      onChange={(e) => onChange({ phone: e.target.value })}
                    />
                  </Field>

                  <Field>
                    <Button
                      type="button"
                      className="h-10 w-full"
                      onClick={() =>
                        onChange({
                          statusMessage:
                            "Commande EGD-2026-8941 trouvée ! Statut : Expédiée — Livreur Amana à Casablanca. Total à payer : 3 490 MAD.",
                        })
                      }
                    >
                      <HugeiconsIcon
                        icon={PackageIcon}
                        data-icon="inline-start"
                      />
                      Localiser mon colis
                    </Button>
                  </Field>

                  {state.statusMessage && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        className="mt-0.5 size-4 shrink-0 text-emerald-600"
                      />
                      <div>{state.statusMessage}</div>
                    </div>
                  )}
                </FieldGroup>
              </CardContent>
            )}

            <CardFooter className="border-t border-border/60 pt-4 text-xs text-muted-foreground">
              <span>Besoin d&apos;assistance ? </span>
              <a
                href={`https://wa.me/${site.contactPhoneDigits}`}
                target="_blank"
                rel="noreferrer"
                className="ms-1 font-medium text-primary hover:underline"
              >
                Parlez à un conseiller sur WhatsApp
              </a>
            </CardFooter>
          </Card>
        </div>

        {/* Right Column — Member Perks & Value Cards (5 cols) */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Card className="border border-border/80 bg-muted/20">
            <CardHeader className="pb-3">
              <Badge variant="outline" className="w-fit gap-1 text-xs">
                <HugeiconsIcon
                  icon={SparklesIcon}
                  className="size-3 text-amber-500"
                />
                Avantages Compte Client
              </Badge>
              <CardTitle className="mt-1 text-base font-semibold">
                Pourquoi avoir un compte Eguidar ?
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-xs">
              <div className="flex items-start gap-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-primary shadow-xs">
                  <HugeiconsIcon
                    icon={DeliveryTruck02Icon}
                    className="size-4"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="font-semibold text-foreground">
                    Suivi en direct
                  </p>
                  <p className="text-muted-foreground">
                    Notifications d&apos;expédition et suivi de
                    l&apos;acheminement de votre colis en temps réel.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-primary shadow-xs">
                  <HugeiconsIcon icon={Invoice01Icon} className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="font-semibold text-foreground">
                    Factures officielles TVA 20%
                  </p>
                  <p className="text-muted-foreground">
                    Téléchargez toutes vos factures avec TVA en PDF pour votre
                    comptabilité ou garantie.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-primary shadow-xs">
                  <HugeiconsIcon icon={Shield01Icon} className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="font-semibold text-foreground">
                    Service après-vente prioritaire
                  </p>
                  <p className="text-muted-foreground">
                    Prise en charge SAV et gestion des garanties constructeur
                    accélérées.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick FAQ Card */}
          <Card className="border border-border/80 p-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold">
                  Une question avant de commander ?
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Consultez nos réponses fréquentes sur la livraison.
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                render={<Link href="/faq" />}
              >
                FAQ ›
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* =========================================================================
   LOGIN PROTOTYPE ROOT SHELL
   Manages in-memory state and the switcher bar
   ========================================================================= */

export function LoginPrototypeShell({ variant }: { variant: "A" | "B" | "C" }) {
  const [state, setState] = useState<PrototypeLoginState>({
    email: "",
    password: "",
    rememberMe: true,
    isLoading: false,
    activeTab: "login",
  })

  const updateState = (patch: Partial<PrototypeLoginState>) => {
    setState((prev) => ({ ...prev, ...patch }))
  }

  const handleSimulatedSubmit = () => {
    if (!state.email) {
      updateState({
        statusMessage: "Veuillez renseigner votre adresse e-mail.",
      })
      return
    }
    updateState({ isLoading: true, statusMessage: undefined })
    setTimeout(() => {
      updateState({
        isLoading: false,
        statusMessage: `Connexion réussie pour ${state.email} ! (Simulation en mémoire)`,
      })
    }, 800)
  }

  return (
    <div className="relative min-h-svh w-full">
      {variant === "A" && (
        <LoginVariantA
          state={state}
          onChange={updateState}
          onSubmit={handleSimulatedSubmit}
        />
      )}
      {variant === "B" && (
        <LoginVariantB
          state={state}
          onChange={updateState}
          onSubmit={handleSimulatedSubmit}
        />
      )}
      {variant === "C" && (
        <LoginVariantC
          state={state}
          onChange={updateState}
          onSubmit={handleSimulatedSubmit}
        />
      )}
    </div>
  )
}
