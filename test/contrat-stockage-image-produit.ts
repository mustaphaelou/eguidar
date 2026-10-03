import { expect } from "vitest"

import {
  DRAFT_PRODUCTS_PREFIX,
  MAX_UPLOAD_SIZE,
  objectKeyFromPublicUrl,
  type CodeEchecStockage,
  type ContentTypeImageProduit,
  type PortStockageImageProduit,
  type ResultatStockageImageProduit,
} from "@/lib/r2"

/**
 * Le contrat que les deux adaptateurs du Stockage d'Image produit rejouent côte
 * à côte.
 *
 * Une couture qui a deux adaptateurs est une couture réelle ; celle-ci en
 * avait deux qui ne se comportaient pas de la même façon — l'un laissait
 * remonter la panne sur deux de ses six opérations, l'autre sur aucune — et
 * rien, nulle part, ne le disait. Le contrat rejoue le même scénario sur chaque
 * adaptateur, dans les mêmes conditions, et affirme que les deux répondent la
 * même observation.
 *
 * **L'adaptateur de production est la référence, parce qu'il est le stockage
 * réel.** Cloudflare R2 est la sémantique de référence de cette couture, et
 * l'adaptateur en mémoire est une fiction qu'on juge contre elle.
 *
 * Cette raison est l'inverse exacte de celle du contrat du registre des
 * Brouillons, où la base tranche et où l'adaptateur en mémoire est jugée contre
 * elle — et c'est pourquoi ce contrat ne se contente pas de comparer les deux.
 * Celui du registre est purement observationnel, et sa justification ne se
 * transporte pas : un contrat qui ne comparerait que « les deux ont répondu la
 * même observation » serait faible exactement dans la direction qui compte, il
 * ne pourrait pas voir la fiction avoir tort, seulement être incohérente.
 * D'où la seconde couche, celle des valeurs épinglées — la dérivation de clé,
 * la réservation du préfixe, le refus de viser l'espace réservé — qui porte sur
 * ce qui doit être vrai indépendamment des deux. Ce module est la couche
 * d'accord ; la couche de valeurs s'y greffe à côté, sur la même projection et
 * le même comparateur, sans rien réorganiser.
 *
 * Il vit dans `test/` et non dans une suite parce que les assertions
 * réellement identiques méritent un seul endroit : chaque suite garde ensuite
 * ses propres invariants dans son propre fichier. Et il ne contient aucune
 * suite — un module de test ne doit pas être à la fois la spécification et sa
 * propre preuve. Une seule suite voisine le rejoue ; elle n'a aucun prérequis
 * de base, la couture ne touche pas la base, et c'est une propriété à
 * revendiquer et non à cacher.
 */

const TAILLE = 2048

/**
 * L'état du stockage qu'un scénario demande au rejeu. Il ne dit pas *comment*
 * un adaptateur meurt, il dit que le stockage est mort : chacun y répond par
 * son propre mécanisme — les variables d'environnement et un client qui rejette
 * d'un côté, une panne par opération de l'autre.
 *
 * La levée n'y figure pas, et c'est délibéré. Demander à un adaptateur de lever
 * ferait du « lever ou répondre » une variable du scénario, donc une question
 * à laquelle le contrat cesserait de répondre. La levée est ce que le contrat
 * **constate** comme divergence ; elle n'est jamais ce qu'un scénario réclame.
 */
export type EtatStockageRejoue = "sain" | "non-configure" | "mort"

/** Un stockage rejoué dans l'état qu'un scénario demande. */
export type AdaptateurStockage = (
  etat: EtatStockageRejoue
) => PortStockageImageProduit

/**
 * Les conditions de départ que les deux adaptateurs partagent.
 *
 * Un rejeu reçoit ici le même identifiant qu'un autre, et c'est l'inverse du
 * contrat du registre : cette couture ne garde aucun état, donc rien à isoler
 * d'un rejeu à l'autre. Et surtout l'adresse observée le porte — une adresse se
 * compare sous forme de clé, et la clé contient l'identifiant : un identifiant
 * neuf par adaptateur rendrait les deux clés différentes et le contrat rouge en
 * permanence, pour une raison qui n'aurait rien à voir avec un désaccord.
 *
 * `basePublique` n'est pas décidée ici : c'est celle du rejeu, et une clé se
 * lit en retirant la base publique de son URL, comme la convention d'ADR-0004
 * l'impose. La suite qui rejoue les deux adaptateurs est seule à savoir quelle
 * base les deux se sont donnée — l'adaptateur en mémoire n'a pas à être
 * reconfigurable pour cela, et le module de production n'a pas à être
 * configuré par une suite.
 */
export interface IdentiteStockage {
  readonly draftId: string
  readonly contentType: ContentTypeImageProduit
  readonly basePublique: string
  /** L'URL publique d'une Image produit déjà persistée. */
  readonly urlImagePersistee: string
  /** L'URL publique d'une image de Structure. */
  readonly urlImageStructure: string
}

/**
 * Une opération observée, à la forme que deux adaptateurs peuvent comparer.
 *
 * Trois cas, et le troisième est ce qui rend l'accord observable : une levée est
 * **constatée** et non propagée. Sans elle, une divergence sur la façon
 * d'échouer se verrait en test rouge sur une pile d'erreurs qui dit « quelque
 * chose a levé » sans dire qui l'a fait — et le scénario qui constate l'accord
 * n'aurait rien à constater.
 */
export type ReponseObservee =
  /**
   * Un succès, et l'adresse que l'opération rend sous forme de clé — ou `null`
   * pour les quatre opérations qui ne rendent aucune adresse, et n'ont rien à en
   * dire : ce qu'elles ont à se dire, c'est qu'elles ont réussi.
   */
  | { ok: true; cle: string | null }
  /**
   * Un refus, et son seul *code*. Le message est le vocabulaire de l'adaptateur
   * et n'entre pas dans la comparaison : le module propriétaire compose le sien
   * à partir du code, et l'éditeur lit toujours celui du module, jamais celui du
   * stockage. Comparer les messages astreindrait les deux adaptateurs à redire
   * la même prose pour un texte que personne ne voit.
   */
  | { ok: false; code: CodeEchecStockage }
  /** Une levée : un constat, pas une exception. */
  | { leve: true }

/**
 * Une URL publique, ramenée à sa clé : c'est sous cette forme qu'une adresse se
 * compare. La conversion est celle du module de stockage — ADR-0004 : la clé se
 * dérive de l'URL en retirant la base publique — et non une coupe de chaîne
 * qui devrait deviner où la base s'arrête.
 */
function cleSous(url: string, base: string): string {
  const cle = objectKeyFromPublicUrl(url, base)
  if (cle === null) {
    // Un `null` ici ne veut pas dire « aucune adresse » : il veut dire que le
    // rejeu ne parle pas la langue de la base publique du contrat. Le laisser
    // passer ferait du scénario un accord sur du vide — les deux adaptateurs
    // se tairaient de la même façon, et le contrat dirait « ils s'accordent »
    // sur deux silences.
    throw new Error(`Adresse publique hors de la base du rejeu : ${url}`)
  }
  return cle
}

/**
 * L'observation d'une opération : sa réponse projetée, ou le constat qu'elle a
 * levée.
 *
 * Toute opération du contrat passe par ici. Une levée qui s'échapperait
 * ferait échouer le contrôle négatif pour la mauvaise raison, en sautant la
 * comparaison qu'il est censé mettre en défaut.
 */
async function observer<T>(
  rejouer: () => Promise<ResultatStockageImageProduit<T>>,
  adresse?: (valeur: T) => string | null
): Promise<ReponseObservee> {
  let resultat: ResultatStockageImageProduit<T>
  try {
    resultat = await rejouer()
  } catch {
    return { leve: true }
  }
  if (!resultat.ok) return { ok: false, code: resultat.erreur.code }
  return { ok: true, cle: adresse ? adresse(resultat.valeur) : null }
}

/** L'entrée que partagent les quatre opérations désignées par un identifiant. */
function demandeBrouillon(identite: IdentiteStockage) {
  return { draftId: identite.draftId, contentType: identite.contentType }
}

/** L'entrée de la seule des six qui porte une taille. */
function demandeEnvoi(identite: IdentiteStockage, taille = TAILLE) {
  return { ...demandeBrouillon(identite), size: taille }
}

/**
 * Une adresse sous l'espace réservé aux Brouillons. Le préfixe vient du module
 * de stockage et non d'une recopie : c'est lui que la règle de cycle de vie
 * Cloudflare cible, et une suite qui le retaperait finirait par valider un
 * préfixe différent de celui qui expire.
 */
function adresseReservee(identite: IdentiteStockage): string {
  return `${identite.basePublique}/${DRAFT_PRODUCTS_PREFIX}interdit.webp`
}

/**
 * Les six opérations du port, observées d'un seul trait.
 *
 * Le rendu est typé `Record<keyof PortStockageImageProduit, …>` : une septième
 * opération y serait une erreur de compilation. On ne peut donc pas ajouter au
 * port une opération dont personne n'aurait constaté ce qu'elle fait quand le
 * stockage est mort — c'est le même gain que la liste des refus vérifiée par le
 * compilateur, appliqué aux opérations.
 */
async function observerLesSix(
  stockage: PortStockageImageProduit,
  identite: IdentiteStockage
): Promise<Record<keyof PortStockageImageProduit, ReponseObservee>> {
  return {
    presignerBrouillon: await observer(
      () => stockage.presignerBrouillon(demandeEnvoi(identite)),
      (valeur) => cleSous(valeur.previewUrl, identite.basePublique)
    ),
    supprimerBrouillon: await observer(() =>
      stockage.supprimerBrouillon(demandeBrouillon(identite))
    ),
    promouvoirBrouillon: await observer(
      () => stockage.promouvoirBrouillon(demandeBrouillon(identite)),
      (valeur) => cleSous(valeur.publicUrl, identite.basePublique)
    ),
    supprimerImagePromue: await observer(() =>
      stockage.supprimerImagePromue(demandeBrouillon(identite))
    ),
    supprimerImagePersistee: await observer(() =>
      stockage.supprimerImagePersistee(identite.urlImagePersistee)
    ),
    supprimerImageCategorie: await observer(() =>
      stockage.supprimerImageCategorie(identite.urlImageStructure)
    ),
  }
}

export interface ScenarioStockage {
  readonly nom: string
  /**
   * L'état du stockage que ce scénario demande. Il va au rejeu et non dans le
   * corps du scénario : un scénario qui se mettait lui-même la panne en place
   * choisirait le mécanisme, et le contrat jugerait alors l'adaptateur sur une
   * panne qu'il a lui-même fabriquée.
   */
  readonly etat: EtatStockageRejoue
  /**
   * Le scénario, écrit une fois et rejoué par chaque adaptateur. Il rend une
   * observation comparable : l'accord que le contrat cherche.
   */
  jouer(
    stockage: PortStockageImageProduit,
    identite: IdentiteStockage
  ): Promise<unknown>
}

/**
 * Les scénarios de la couche d'accord. Chacun se lit comme une phrase du
 * domaine, et aucun n'écrit la valeur attendue : l'accord entre les deux
 * adaptateurs est l'assertion, et une valeur propre à un adaptateur n'y a pas
 * sa place — ce qui doit être vrai indépendamment des deux appartient à la
 * couche des valeurs épinglées. Les refus qu'ils produisent sont énumérés par
 * `CODES_ECHEC_CONTRAT`, que la suite vérifie — sans quoi un contrat qui ne
 * refuserait plus rien passerait aussi facilement qu'un contrat juste.
 *
 * Cette liste est celle de l'accord. La couche des valeurs épinglées en est une
 * autre, à côté : elle rejoue un seul adaptateur et compare à des valeurs
 * attendues, et elle n'a besoin ni d'une autre projection ni d'un autre
 * comparateur que ceux d'ici.
 */
export const SCENARIOS_STOCKAGE: readonly ScenarioStockage[] = [
  {
    nom: "pré-signifier l'envoi d'un Brouillon et nommer son aperçu",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        // L'adresse d'envoi n'est pas observée, et elle ne peut pas l'être :
        // l'adaptateur de production ne rend jamais sa clé au client — sa suite
        // le prouve sur le JSON lui-même — donc il n'y a pas de clé à
        // comparer, seulement deux signataires qui n'ont pas à se ressembler.
        // L'aperçu, lui, est l'adresse que l'éditeur verra et que les deux
        // adaptateurs doivent nommer de la même façon.
        apercu: await observer(
          () => stockage.presignerBrouillon(demandeEnvoi(identite)),
          (valeur) => cleSous(valeur.previewUrl, identite.basePublique)
        ),
      }
    },
  },
  {
    nom: "promouvoir un Brouillon vers une Image produit persistée",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        image: await observer(
          () => stockage.promouvoirBrouillon(demandeBrouillon(identite)),
          (valeur) => cleSous(valeur.publicUrl, identite.basePublique)
        ),
      }
    },
  },
  {
    nom: "libérer l'objet d'un Brouillon vivant",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        liberation: await observer(() =>
          stockage.supprimerBrouillon(demandeBrouillon(identite))
        ),
      }
    },
  },
  {
    nom: "retirer la copie promue d'un Brouillon",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        copie: await observer(() =>
          stockage.supprimerImagePromue(demandeBrouillon(identite))
        ),
      }
    },
  },
  {
    nom: "retirer une Image produit déjà persistée",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        image: await observer(() =>
          stockage.supprimerImagePersistee(identite.urlImagePersistee)
        ),
      }
    },
  },
  {
    nom: "retirer une image de Structure hors de l'espace réservé",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        image: await observer(() =>
          stockage.supprimerImageCategorie(identite.urlImageStructure)
        ),
      }
    },
  },
  {
    nom: "refuser une taille qui n'est pas le volume d'une image",
    etat: "sain",
    async jouer(stockage, identite) {
      // Une taille nulle et une taille au-delà de la limite : les deux sens du
      // refus, que la seule borne supérieure laisserait inaperçus. La limite
      // elle-même n'est pas réécrite ici — elle est un fait du module, et le
      // contrat compare deux réponses, pas des valeurs de module.
      return {
        vide: await observer(() =>
          stockage.presignerBrouillon(demandeEnvoi(identite, 0))
        ),
        auDela: await observer(() =>
          stockage.presignerBrouillon(
            demandeEnvoi(identite, MAX_UPLOAD_SIZE + 1)
          )
        ),
      }
    },
  },
  {
    nom: "refuser un identifiant d'image indéparable",
    etat: "sain",
    // Un identifiant qui contient un séparateur ne désigne pas une Image, il
    // désigne un chemin : il pourrait viser l'espace réservé par un navigateur
    // d'objet qui ne le vérifierait pas. Les quatre opérations désignées par un
    // identifiant le refusent donc de la même façon, et le contrat exige cette
    // uniformité — c'est le port qui décide, pas le scénario.
    async jouer(stockage, identite) {
      const demande = {
        ...demandeBrouillon(identite),
        draftId: `produits/${identite.draftId}`,
      }
      return {
        apercu: await observer(() =>
          stockage.presignerBrouillon({ ...demande, size: TAILLE })
        ),
        liberation: await observer(() => stockage.supprimerBrouillon(demande)),
        promotion: await observer(() => stockage.promouvoirBrouillon(demande)),
        copie: await observer(() => stockage.supprimerImagePromue(demande)),
      }
    },
  },
  {
    nom: "refuser de viser l'espace réservé aux Brouillons depuis une Image produit",
    etat: "sain",
    // L'expiration d'un Brouillon abandonné est le fait de la règle de cycle de
    // vie Cloudflare sur le préfixe réservé. Une suppression d'Image produit
    // qui l'atteindrait prendrait cette règle pour une permission de nettoyer,
    // et supprimerait un objet dont le registre dit qu'il attend encore son
    // éditeur.
    async jouer(stockage, identite) {
      return {
        image: await observer(() =>
          stockage.supprimerImagePersistee(adresseReservee(identite))
        ),
      }
    },
  },
  {
    nom: "refuser de viser l'espace réservé aux Brouillons depuis une image de Structure",
    etat: "sain",
    // Même frontière, autre opération : une image de Structure est un champ URL
    // libre, antérieur au cycle de vie des Brouillons, et c'est précisément ce
    // qui la rend dangereuse — elle peut nommer n'importe quoi sous la base
    // publique, l'espace réservé compris.
    async jouer(stockage, identite) {
      return {
        image: await observer(() =>
          stockage.supprimerImageCategorie(adresseReservee(identite))
        ),
      }
    },
  },
  {
    nom: "refuser une URL que la base publique du stockage ne nomme pas",
    etat: "sain",
    // Une URL d'une autre base ne dit rien du bucket : elle n'a pas de clé sous
    // la base attendue, donc pas d'adresse à supprimer — et une suppression sans
    // adresse viserait ce que le signataire choisirait, donc n'importe quoi.
    async jouer(stockage, identite) {
      const ailleurs = identite.urlImagePersistee.replace(
        identite.basePublique,
        "https://ailleurs.example.test"
      )
      return {
        image: await observer(() => stockage.supprimerImagePersistee(ailleurs)),
        structure: await observer(() =>
          stockage.supprimerImageCategorie(ailleurs)
        ),
      }
    },
  },
  {
    nom: "un stockage non configuré répond aux six opérations qu'on lui demande",
    etat: "non-configure",
    // Une configuration absente est le seul des accidents que le port sait dire
    // qui ne dépende pas de l'opération : sans identifiants ni base publique,
    // aucune des six n'a d'adresse à rendre. Les six sont donc observées d'un
    // bloc — une seule d'entre elles qui oublierait de refuser suffirait à faire
    // diverger le cycle de vie, et le défaut se verrait d'un coup.
    async jouer(stockage, identite) {
      return await observerLesSix(stockage, identite)
    },
  },
  {
    nom: "un stockage mort se répond, il ne se lève pas",
    etat: "mort",
    // **La raison d'être de ce contrat.**
    //
    // Le port sait exprimer trois échecs et rien d'autre : une panne y est donc
    // nécessairement l'un des trois, jamais une exception qui remonte jusqu'à
    // l'appelant. Les six opérations le tiennent aujourd'hui — l'adaptateur de
    // production traduit chaque `send` et chaque signataire qui échoue, et
    // l'adaptateur en mémoire sait répondre pour chacune des six.
    //
    // L'accord est donc : **les six opérations répondent, et lever serait la
    // divergence.** C'est ce que ce scénario consigne. Une levée du côté du
    // stockage ne ferait pas échouer la suite par une exception — elle y
    // parviendrait projetée en `{ leve: true }`, à côté d'un refus des deux
    // adaptateurs, et l'accord la verrait comme ce qu'elle est : un adaptateur
    // qui a décidé seul de ne pas répondre. Les deux `catch` du module
    // propriétaire qui rattrapent une exception du stockage restent ainsi
    // inatteignables par ce port, et le contrat le dit au lieu de le laisser
    // croire nécessaire.
    async jouer(stockage, identite) {
      return await observerLesSix(stockage, identite)
    },
  },
]

/**
 * Les codes d'échec que le contrat doit atteindre. Une suite qui les énumère
 * prouve que le contrat n'est pas vide : un accord obtenu parce que les deux
 * adaptateurs ne refusent plus rien n'est un accord sur rien.
 *
 * C'est un `Record` du code au marqueur, pas un tableau de codes : le type est
 * la clé, donc TypeScript exige **toutes** les clés de `CodeEchecStockage`. Un
 * code ajouté au port sans scénario ici est une erreur de compilation, jamais
 * un refus que la garde de non-vacuité laisserait passer en silence — un
 * tableau typé `readonly string[]` ne lierait la liste à rien et pourrait
 * devenir vide sans que `tsc` ni la suite ne le remarquent.
 */
export const CODES_ECHEC_CONTRAT: Record<CodeEchecStockage, true> = {
  "non-configure": true,
  "parametre-invalide": true,
  "erreur-stockage": true,
}

async function rejouer(
  scenario: ScenarioStockage,
  adaptateur: AdaptateurStockage,
  identite: IdentiteStockage
): Promise<unknown> {
  // L'adaptateur est construit ici, et non avant le rejeu : chaque adaptateur
  // rejoue le scénario avec son propre stockage neuf, dans l'état que le
  // scénario demande. C'est à cette fabrique que la suite accroche sa discipline
  // de rejeu — variables effacées puis réamorcées, client mémorisé remis à
  // zéro — et c'est la seule façon que ce soit vrai pour le second adaptateur
  // comme pour le premier.
  return scenario.jouer(adaptateur(scenario.etat), identite)
}

/**
 * Rejoue un scénario sur chaque adaptateur, dans les mêmes conditions de départ,
 * et affirme que tous répondent la même observation. Rend les observations, pour
 * qu'une suite puisse en déduire les échecs que le contrat atteint.
 */
export async function exigerEnteteStockage(
  scenario: ScenarioStockage,
  adaptateurs: readonly AdaptateurStockage[],
  identite: IdentiteStockage
): Promise<readonly unknown[]> {
  const observations: unknown[] = []
  for (const adaptateur of adaptateurs) {
    observations.push(await rejouer(scenario, adaptateur, identite))
  }
  const [reference, ...autres] = observations
  for (const autre of autres) {
    expect(autre, `${scenario.nom} — accord entre les adaptateurs`).toEqual(
      reference
    )
  }
  return observations
}

/** Les codes d'échec qu'une observation contient, à quelque profondeur. */
export function codesEchec(observation: unknown): string[] {
  const codes: string[] = []
  const visiter = (valeur: unknown): void => {
    if (Array.isArray(valeur)) {
      valeur.forEach(visiter)
      return
    }
    if (!valeur || typeof valeur !== "object") return
    for (const [cle, contenu] of Object.entries(valeur)) {
      if (cle === "code" && typeof contenu === "string") codes.push(contenu)
      else visiter(contenu)
    }
  }
  visiter(observation)
  return codes
}
