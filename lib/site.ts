const contactPhone = "+212 661 234 567"

const repositoryUrl = "https://github.com/mustaphaelou/eguidar"

export const site = {
  name: "eguidar.com",
  legalName: "Eguidar",
  url: "https://eguidar.com",
  repositoryUrl,
  licenseUrl: `${repositoryUrl}/blob/main/LICENSE`,
  tagline: "L'électronique au meilleur prix, livrée partout au Maroc.",
  description:
    "Smartphones, ordinateurs, TV, gaming et accessoires au meilleur prix au Maroc. Prix en MAD, TVA 20% incluse, paiement à la livraison.",
  contactEmail: "contact@eguidar.com",
  contactPhone,
  contactPhoneDigits: contactPhone.replace(/\D/g, ""),
  whatsappMessage:
    "Bonjour Eguidar, j'ai une question concernant votre boutique.",
} as const

export const logo = {
  src: "/brand/eguidar-logo.svg",
  width: 1352,
  height: 442.5,
  alt: site.name,
} as const

export const siteIcon = {
  src: "/brand/eguidar-icon-512.png",
  width: 512,
  height: 512,
} as const

export const staticPages = [
  { href: "/a-propos", label: "À propos" },
  { href: "/contact", label: "Contact" },
  { href: "/faq", label: "FAQ" },
  { href: "/blog", label: "Blog" },
  { href: "/conditions", label: "Conditions & livraison" },
] as const
