import type {
  BrouillonImagePresigne,
  PortTeleversementBrouillons,
} from "./televersement-brouillons"

const MESSAGE_PRESIGNATION_REFUSEE = "Échec de la pré-signature"
const MESSAGE_ENVOI_REFUSE = "Échec de l'envoi vers le stockage"
const MESSAGE_REPONSE_INVALIDE = "Réponse de téléversement invalide"
const MESSAGE_LIBERATION_REFUSEE =
  "Échec de la libération du Brouillon d'Image produit"

async function messageDuCorps(
  response: Response,
  defaut: string
): Promise<string> {
  const corps = (await response.json().catch(() => null)) as {
    error?: unknown
  } | null
  return typeof corps?.error === "string" ? corps.error : defaut
}

function faitsPresignation(corps: unknown): BrouillonImagePresigne | null {
  if (typeof corps !== "object" || corps === null) return null
  const faits = corps as Record<string, unknown>
  return typeof faits.draftId === "string" &&
    typeof faits.uploadUrl === "string" &&
    typeof faits.previewUrl === "string"
    ? {
        draftId: faits.draftId,
        uploadUrl: faits.uploadUrl,
        previewUrl: faits.previewUrl,
      }
    : null
}

const portHttpTeleversementBrouillons: PortTeleversementBrouillons = {
  async presigner({ contentType, size }) {
    let response: Response
    try {
      response = await fetch("/api/admin/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType, size }),
      })
    } catch {
      return { ok: false, message: MESSAGE_PRESIGNATION_REFUSEE }
    }

    if (!response.ok) {
      return {
        ok: false,
        message: await messageDuCorps(response, MESSAGE_PRESIGNATION_REFUSEE),
      }
    }

    const faits = faitsPresignation(await response.json().catch(() => null))
    return faits === null
      ? { ok: false, message: MESSAGE_REPONSE_INVALIDE }
      : { ok: true, ...faits }
  },

  async envoyer({ uploadUrl, fichier }) {
    try {
      const response = await fetch(uploadUrl, { method: "PUT", body: fichier })
      return response.ok
        ? { ok: true }
        : { ok: false, message: MESSAGE_ENVOI_REFUSE }
    } catch {
      return { ok: false, message: MESSAGE_ENVOI_REFUSE }
    }
  },

  async relacher(draftId) {
    let response: Response
    try {
      response = await fetch("/api/admin/uploads/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId }),
      })
    } catch {
      return { ok: false, message: MESSAGE_LIBERATION_REFUSEE }
    }

    if (!response.ok) {
      return {
        ok: false,
        message: await messageDuCorps(response, MESSAGE_LIBERATION_REFUSEE),
      }
    }

    return { ok: true }
  },
}

export default portHttpTeleversementBrouillons
