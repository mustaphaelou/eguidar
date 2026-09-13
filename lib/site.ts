const contactPhone = "+212 661 234 567"

export const site = {
  name: "eguidar.com",
  legalName: "Eguidar",
  url: "https://eguidar.com",
  tagline: "L'électronique au meilleur prix, livrée partout au Maroc.",
  description:
    "Smartphones, ordinateurs, TV, gaming et accessoires au meilleur prix au Maroc. Prix en MAD, TVA 20% incluse, paiement à la livraison.",
  contactEmail: "contact@eguidar.com",
  contactPhone,
  contactPhoneDigits: contactPhone.replace(/\D/g, ""),
  whatsappMessage:
    "Bonjour Eguidar, j'ai une question concernant votre boutique.",
} as const

export const brand = {
  lockup: {
    src: "/brand/eguidar-logo.svg",
    width: 1352,
    height: 442,
    alt: site.name,
  },
  siteIcon: {
    src: "/brand/eguidar-icon-512.png",
    width: 512,
    height: 512,
  },
} as const

export const staticPages = [
  { href: "/a-propos", label: "À propos" },
  { href: "/contact", label: "Contact" },
  { href: "/faq", label: "FAQ" },
  { href: "/blog", label: "Blog" },
  { href: "/conditions", label: "Conditions & livraison" },
] as const
