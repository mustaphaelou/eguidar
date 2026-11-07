import type { OrderEmailSnapshot } from "@/lib/automations/charge"
import {
  rendreLettre,
  type Bloc,
  type LigneDeLettre,
} from "@/lib/emails/gabarit"
import type { MessageEmail } from "@/lib/emails/message"
import { lignesPiedTexte } from "@/lib/emails/pied"
import { formatPrice } from "@/lib/money"
import { récapitulatifRowsFromCommande } from "@/lib/recapitulatif-paiement"
import { site } from "@/lib/site"
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/statut-de-commande"
import { shortOrderId } from "@/lib/utils"

const PHRASE_PAIEMENT =
  "Réglez en espèces au livreur lors de la réception de votre colis."

const LIBELLÉ_BOUTON = "Suivre ma commande"

interface CopieStatut {
  introduction: string
  encart?: { titre: string; texte: string }
}

const COPIES_STATUT: Record<OrderStatus, CopieStatut> = {
  pending: { introduction: "Nous avons bien reçu votre commande." },
  confirmed: {
    introduction: "Votre commande est confirmée : nous la préparons.",
  },
  shipped: {
    introduction: "Votre commande est expédiée : elle arrive bientôt.",
  },
  delivered: {
    introduction: "Votre commande est livrée. Merci de votre confiance.",
  },
  cancelled: {
    introduction: "Votre commande a été annulée.",
    encart: {
      titre: "Annulée",
      texte: "Vous n'avez rien à payer.",
    },
  },
  returned: {
    introduction: "Votre commande a été retournée.",
    encart: {
      titre: "Retournée",
      texte:
        "Si vous avez réglé la livraison, écrivez-nous pour demander un remboursement.",
    },
  },
}

function urlSuivi(): string {
  return `${site.url}/commandes`
}

function lignesArticles(snapshot: OrderEmailSnapshot): LigneDeLettre[] {
  return snapshot.items.map((item) => {
    const variante = item.variantName.trim()
    return {
      label:
        variante === ""
          ? item.productName
          : `${item.productName} · ${variante}`,
      value: formatPrice(item.price * item.quantity),
      note: `quantité ${item.quantity}`,
    }
  })
}

function lignesLivraison(snapshot: OrderEmailSnapshot): LigneDeLettre[] {
  const adresse = [snapshot.address.trim(), snapshot.cityName.trim()]
    .filter((partie) => partie !== "")
    .join(", ")
  const téléphone = snapshot.phone.trim()
  const lignes: LigneDeLettre[] = []
  if (adresse !== "") lignes.push({ label: "Livraison", value: adresse })
  if (téléphone !== "") lignes.push({ label: "Téléphone", value: téléphone })
  return lignes
}

function lignesFactuelles(lignes: readonly LigneDeLettre[]): string[] {
  return lignes.map((ligne) => {
    const note = ligne.note?.trim() ?? ""
    return note === ""
      ? `${ligne.label} — ${ligne.value}`
      : `${ligne.label} — ${note} — ${ligne.value}`
  })
}

interface EnteteLettre {
  titre: string
  paragraphe?: string
  introductionTexte: string
  statut?: OrderStatus
  encart?: { titre?: string; texte?: string }
}

function composerLettre(
  snapshot: OrderEmailSnapshot,
  entete: EnteteLettre
): { html: string; texte: string } {
  const articles = lignesArticles(snapshot)
  const récapitulatif = récapitulatifRowsFromCommande(snapshot)
  const livraison = lignesLivraison(snapshot)

  const blocs: Bloc[] = [{ type: "titre", texte: entete.titre }]
  if (entete.paragraphe !== undefined) {
    blocs.push({ type: "paragraphe", texte: entete.paragraphe })
  }
  if (entete.statut !== undefined) {
    blocs.push({ type: "etapes", statut: entete.statut })
  }
  if (entete.encart !== undefined) {
    blocs.push({ type: "encart", ...entete.encart })
  }
  if (articles.length > 0) {
    blocs.push({ type: "lignes", lignes: articles })
  }
  blocs.push({ type: "lignes", lignes: récapitulatif })
  if (livraison.length > 0) {
    blocs.push({ type: "lignes", lignes: livraison })
  }
  blocs.push({ type: "paragraphe", texte: PHRASE_PAIEMENT })
  blocs.push({ type: "bouton", libellé: LIBELLÉ_BOUTON, url: urlSuivi() })

  const corpsHtml = rendreLettre({
    préEnTête: entete.introductionTexte,
    noteEnTête: `Commande ${shortOrderId(snapshot.orderId)}`,
    blocs,
  })

  const encartTexte =
    entete.encart === undefined
      ? []
      : [entete.encart.titre, entete.encart.texte].filter(
          (ligne): ligne is string => ligne !== undefined && ligne.trim() !== ""
        )

  const sections = [
    ["Eguidar"],
    [`Commande ${shortOrderId(snapshot.orderId)}`],
    [entete.introductionTexte],
    encartTexte,
    [...lignesFactuelles(articles), ...lignesFactuelles(récapitulatif)],
    lignesFactuelles(livraison),
    [PHRASE_PAIEMENT],
    [`${LIBELLÉ_BOUTON} : ${urlSuivi()}`],
    lignesPiedTexte(),
  ]
    .filter((section) => section.length > 0)
    .map((section) => section.join("\n"))

  return { html: corpsHtml, texte: sections.join("\n\n") }
}

export function messageCommandePlacee(
  snapshot: OrderEmailSnapshot
): MessageEmail {
  const introduction = "Merci pour votre commande ! Nous l'avons bien reçue."
  const corps = composerLettre(snapshot, {
    titre: "Merci pour votre commande",
    paragraphe: introduction,
    introductionTexte: introduction,
  })
  return {
    sujet: `Commande ${shortOrderId(snapshot.orderId)} reçue — Eguidar`,
    ...corps,
  }
}

export function messageCommandeStatut(
  snapshot: OrderEmailSnapshot,
  statut: OrderStatus
): MessageEmail {
  const copie = COPIES_STATUT[statut]
  const corps = composerLettre(snapshot, {
    titre: copie.introduction,
    introductionTexte: copie.introduction,
    statut,
    encart: copie.encart,
  })
  return {
    sujet: `Votre commande ${shortOrderId(snapshot.orderId)} : ${ORDER_STATUS_LABELS[statut]} — Eguidar`,
    ...corps,
  }
}
