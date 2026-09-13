import type { Metadata } from "next"
import Link from "next/link"

import { pageMetadata } from "@/lib/metadata"
import { site } from "@/lib/site"

export const metadata: Metadata = pageMetadata({
  title: "Politique de confidentialité",
  description:
    "Comment eguidar.com collecte, utilise et protège vos données personnelles : compte, commandes, connexion via Google ou Facebook, cookies, droits et suppression des données.",
  path: "/confidentialite",
})

export default function ConfidentialitePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold">Politique de confidentialité</h1>
      <p className="mt-3 text-muted-foreground">
        Cette page décrit les données personnelles collectées sur eguidar.com,
        pourquoi elles le sont, combien de temps elles sont conservées et
        comment exercer vos droits. Dernière mise à jour&nbsp;: septembre 2026.
      </p>

      <div className="mt-10 flex flex-col gap-8">
        <Section title="1. Responsable du traitement">
          <p>
            Le responsable du traitement est {site.legalName}, exploitant la
            boutique en ligne {site.name}. Pour toute question relative à vos
            données personnelles, contactez-nous par e-mail à{" "}
            <a
              href={`mailto:${site.contactEmail}`}
              className="font-medium text-primary hover:underline"
            >
              {site.contactEmail}
            </a>{" "}
            ou via la{" "}
            <Link
              href="/contact"
              className="font-medium text-primary hover:underline"
            >
              page Contact
            </Link>
            .
          </p>
        </Section>

        <Section title="2. Données que nous collectons">
          <ul className="list-disc pl-5">
            <li>
              <strong>Compte client</strong> : nom, adresse e-mail et mot de
              passe (stocké de manière sécurisée, jamais en clair).
            </li>
            <li>
              <strong>Connexion via Google ou Facebook</strong> : si vous
              utilisez l&apos;un de ces boutons, nous recevons votre nom, votre
              adresse e-mail et votre identifiant de profil chez le fournisseur.
              Nous ne recevons jamais votre mot de passe Google ou Facebook.
            </li>
            <li>
              <strong>Commandes</strong> : nom, numéro de téléphone, adresse et
              ville de livraison, contenu et montant de la commande.
            </li>
            <li>
              <strong>Paiement</strong> : le paiement se fait exclusivement à la
              livraison ; aucune donnée bancaire n&apos;est collectée ni
              conservée.
            </li>
            <li>
              <strong>Données techniques</strong> : un cookie de session pour
              rester connecté, un cookie de panier pour conserver vos articles
              pendant 30 jours, et un jeton anti-robot lors de la connexion ou
              de l&apos;inscription.
            </li>
          </ul>
        </Section>

        <Section title="3. Pourquoi nous utilisons ces données">
          <ul className="list-disc pl-5">
            <li>créer et gérer votre compte, et vous authentifier ;</li>
            <li>
              préparer, livrer et suivre vos commandes, et vous contacter à leur
              sujet ;
            </li>
            <li>assurer le service client, les retours et les remboursements ;</li>
            <li>protéger le site contre les abus et les robots ;</li>
            <li>respecter nos obligations légales, notamment comptables.</li>
          </ul>
          <p>
            Nous ne vendons ni ne louons vos données personnelles, et nous ne
            les utilisons pas à des fins de publicité ciblée.
          </p>
        </Section>

        <Section title="4. Connexion via Google ou Facebook">
          <p>
            Les boutons « Continuer avec Google » et « Continuer avec Facebook »
            vous permettent de créer votre compte ou de vous connecter sans mot
            de passe. Dans ce cas, le fournisseur nous transmet uniquement votre
            nom, votre adresse e-mail et un identifiant de profil, que nous
            utilisons pour créer votre compte et le lier à vos commandes.
          </p>
          <p>
            Vous pouvez à tout moment révoquer l&apos;accès d&apos;
            {site.legalName} depuis les paramètres de votre compte Google
            (Sécurité → Vos connexions à des applications tierces) ou Facebook
            (Paramètres → Applications et sites web). Pour en savoir plus,
            consultez la politique de confidentialité de{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary hover:underline"
            >
              Google
            </a>{" "}
            et celle de{" "}
            <a
              href="https://www.facebook.com/privacy/policy"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary hover:underline"
            >
              Facebook
            </a>
            .
          </p>
        </Section>

        <Section title="5. Partage des données">
          <p>
            Vos données ne sont partagées que dans la mesure nécessaire au
            fonctionnement de la boutique :
          </p>
          <ul className="list-disc pl-5">
            <li>
              nos prestataires techniques, qui agissent pour notre compte
              (hébergement du site, envoi des e-mails de confirmation, stockage
              des images, protection anti-robot) ;
            </li>
            <li>
              les livreurs chargés de vous remettre votre colis (nom, téléphone
              et adresse de livraison, montant à encaisser) ;
            </li>
            <li>
              les autorités compétentes, lorsque la loi nous y oblige.
            </li>
          </ul>
        </Section>

        <Section title="6. Durée de conservation">
          <ul className="list-disc pl-5">
            <li>
              Compte client : jusqu&apos;à sa suppression, puis 30 jours
              maximum ;
            </li>
            <li>Panier visiteur : 30 jours ;</li>
            <li>
              Commandes et documents comptables : conservés conformément aux
              obligations légales (jusqu&apos;à 10 ans), puis supprimés ou
              anonymisés ;
            </li>
            <li>
              Session de connexion : expire automatiquement après 30 minutes
              d&apos;inactivité.
            </li>
          </ul>
        </Section>

        <Section title="7. Vos droits">
          <p>
            Conformément à la loi marocaine n° 09-08 relative à la protection
            des personnes physiques à l&apos;égard du traitement des données à
            caractère personnel, vous disposez d&apos;un droit d&apos;accès, de
            rectification, d&apos;opposition et de suppression de vos données.
            Pour exercer ces droits, contactez-nous par e-mail à{" "}
            <a
              href={`mailto:${site.contactEmail}`}
              className="font-medium text-primary hover:underline"
            >
              {site.contactEmail}
            </a>
            . Pour supprimer votre compte, suivez la procédure décrite sur la
            page{" "}
            <Link
              href="/suppression-donnees"
              className="font-medium text-primary hover:underline"
            >
              Suppression des données
            </Link>
            .
          </p>
          <p>
            Vous pouvez également adresser une réclamation à la Commission
            nationale de contrôle de la protection des données à caractère
            personnel (CNDP,{" "}
            <a
              href="https://www.cndp.ma"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary hover:underline"
            >
              cndp.ma
            </a>
            ).
          </p>
        </Section>

        <Section title="8. Cookies">
          <p>
            Nous utilisons uniquement des cookies nécessaires au fonctionnement
            de la boutique : cookie de session, cookie de panier et jeton
            anti-robot. Nous n&apos;utilisons aucun cookie publicitaire ni
            traceur de réseaux sociaux. Vous pouvez supprimer ou bloquer les
            cookies depuis les réglages de votre navigateur ; certaines
            fonctionnalités, comme le panier, pourraient alors ne plus
            fonctionner.
          </p>
        </Section>

        <Section title="9. Sécurité">
          <p>
            Les mots de passe sont stockés de manière sécurisée et les échanges
            avec le site sont protégés par HTTPS. L&apos;accès aux données est
            limité aux personnes qui en ont besoin pour traiter les commandes et
            assurer le support.
          </p>
        </Section>

        <Section title="10. Modifications">
          <p>
            Cette politique peut être mise à jour pour refléter des changements
            du service ou de la réglementation. La date de dernière mise à jour
            figure en haut de cette page.
          </p>
        </Section>

        <Section title="11. Contact">
          <p>
            Pour toute question relative à cette politique, contactez-nous par
            e-mail à{" "}
            <a
              href={`mailto:${site.contactEmail}`}
              className="font-medium text-primary hover:underline"
            >
              {site.contactEmail}
            </a>
            , par téléphone ou WhatsApp au{" "}
            <a
              href={`tel:+${site.contactPhoneDigits}`}
              className="font-medium text-primary hover:underline"
            >
              {site.contactPhone}
            </a>{" "}
            ou via la{" "}
            <Link
              href="/contact"
              className="font-medium text-primary hover:underline"
            >
              page Contact
            </Link>
            .
          </p>
        </Section>
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}
