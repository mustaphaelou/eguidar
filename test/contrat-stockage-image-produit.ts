import { expect } from "vitest"

import {
  CONTENT_TYPES_IMAGE_PRODUIT,
  DRAFT_PRODUCTS_PREFIX,
  MAX_UPLOAD_SIZE,
  objectKeyFromPublicUrl,
  PRODUCTS_PREFIX,
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

/**
 * La couche de valeurs épinglées.
 *
 * La couche d'accord ci-dessus compare deux adaptateurs ; celle-ci ne les
 * compare pas et ne se soucie pas d'eux. Elle rejoue **un seul** adaptateur —
 * la référence, le stockage réel — et affirme que ce qu'il rend est exactement
 * la valeur attendue. Elle est la seconde moitié du contrat, et elle existe
 * parce que l'accord est faible exactement dans la direction qui compte :
 *
 * **L'accord ne peut pas voir la fiction avoir tort, seulement être
 * incohérente.** Les deux adaptateurs dérivent leurs clés par la même fonction
 * de production, donc un défaut de cette fonction traverse les deux et passe
 * vert partout : le contrat d'accord le voit puisque les deux dérivent pareil,
 * et les suites d'adaptateur le voient puisque chacune n'épingle que ce qu'elle
 * manipule. Ce qui manque, c'est une affirmation qui dise « la clé d'un
 * Brouillon est celle-là », et qui reste vraie quand les deux adaptateurs se
 * trompent ensemble.
 *
 * Elle diffère du contrat du registre sur un point précis, et la raison ne se
 * transporte pas. Le registre ne compare que des observations parce que la base
 * est autoritaire : la base tranche, l'adaptateur en mémoire doit être jugé
 * contre elle, et un adaptateur qui rend le même état que la base rend le bon
 * état. Ici la référence est le stockage et non une base, et l'adaptateur en
 * mémoire est une fiction : il n'a aucun moyen de trancher ce qui est vrai, il
 * ne peut que rejouer. LeWm rôle est donc juge, pas référence — et un juge qui
 * rejoue ce qu'il juge ne prouve rien. D'où l'épinglage, et d'où le fait que
 * cette couche ne doive son résultat qu'à une valeur écrite d'avance.
 *
 * Elle est déclarée ici, à côté de la couche d'accord, et rejouée par la même
 * suite voisine : le contrat du Stockage d'Image produit reste **un seul lieu
 * déclaré**, et la question « comment une Image produit devient-elle une clé »
 * a une réponse, pas deux. Une seconde suite pour cette couche aurait donné au
 * contrat deux preuves, ce que l'arrangement du registre refuse pour une seule.
 */

/**
 * L'identifiant que cette couche épingle.
 *
 * Il est écrit ici et non reçu du rejeu, et c'est ce qui sépare une valeur
 * attendue d'une valeur recopiée : une clé attendue dont l'identifiant viendrait
 * de l'observation serait vraie par construction — elle referait la dérivation
 * qu'elle est censée contredire. La base publique, elle, reste seule à venir du
 * rejeu : c'est la seule chose que les deux adaptateurs n'ont pas en commun, et
 * la clé s'en affranchit puisqu'elle la retire de l'adresse.
 */
const IDENTITE_EPINGLEE = "image-produit-1"

/**
 * L'extension qu'attend la disposition d'ADR-0004 pour un type de contenu : son
 * sous-type MIME, tel quel.
 *
 * Elle est **dérivée** du type et non recopiée type par type, et c'est le sens
 * entier de la méthode. Une liste de littéraux aurait redit la liste des types
 * autorisés sous une autre forme : le jour où un sixième type est autorisé,
 * cette liste-ci serait fausse sans que personne l'ait consultée, tandis que la
 * dérivation le suit seule. Un type qui n'a rien à voir avec les cinq premiers —
 * `image/jxl`, disons — se retrouve donc épinglé sans qu'une ligne soit écrite,
 * et une faute de frappe dans la table de production — un `.jpg` là où il faut
 * un `.png` — reste vue parce que la règle, elle, ne se trompe pas de tableau.
 *
 * `image/jpeg` est le seul qui dévie, et pour une raison qui tient : `.jpeg`
 * est un nom de fichier que personne n'écrit, alors qu'une image de catalogue
 * est servie à des navigateurs et à des CDN qui attendent tous `.jpg`. C'est un
 * fait de ce catalogue et non une table, et il se distingue donc d'une faute
 * de frappe précisément parce qu'il est le seul.
 */
function extensionAttendue(contentType: ContentTypeImageProduit): string {
  const sousType = contentType.slice("image/".length)
  return sousType === "jpeg" ? ".jpg" : `.${sousType}`
}

/**
 * La clé attendue d'un objet de Brouillon : la disposition d'ADR-0004,
 * `products/brouillons/<uuid><ext>`.
 *
 * Les deux préfixes sont **écrits en clair**, et c'est la différence à faire
 * avec `adresseReservee` ci-dessus, qui prend le préfixe du module de stockage.
 * Les deux choix sont justes et ils ne se ressemblent pas. Une *entrée* doit
 * venir du module : elle adresse ce que la règle de cycle de vie Cloudflare
 * vise, et une suite qui retaperait le préfixe validerait un préfixe différent
 * de celui qui expire. Une *attente* doit au contraire venir
 * d'ailleurs, sinon elle ne dit rien : écrire la disposition d'ADR-0004 ici est
 * la seule façon que le préfixe puisse changer sans que l'épinglage le suive
 * par erreur.
 *
 * `products/brouillons/image-produit-1.jpg` pour `image/jpeg`,
 * `products/brouillons/image-produit-1.png` pour `image/png`, et ainsi de
 * suite — une par type autorisé.
 */
function cleBrouillonAttendue(contentType: ContentTypeImageProduit): string {
  return `products/brouillons/${IDENTITE_EPINGLEE}${extensionAttendue(
    contentType
  )}`
}

/**
 * La clé attendue d'une Image produit persistée, pour le même identifiant :
 * `products/<uuid><ext>`. C'est le fait que la règle de cycle de vie doit
 * pouvoir rater, et il est écrit ici plutôt que déduit du préfixe réservé — le
 * dire « la clé persistée est celle qui n'est pas celle du Brouillon » laisserait
 * le préfixe du produit sans épinglage.
 */
function clePersisteeAttendue(contentType: ContentTypeImageProduit): string {
  return `products/${IDENTITE_EPINGLEE}${extensionAttendue(contentType)}`
}

/**
 * Où une clé atterrit dans l'espace de noms du stockage.
 *
 * Une clé observée est ramenée à ce qu'elle **occupe** plutôt qu'à la suite de
 * son nom, et c'est ce qui rend l'invariant de la règle de cycle de vie
 * lisible d'un coup : la règle expire tout ce qui commence par l'espace réservé,
 * et une Image produit persistée doit donc être notée `produits`. Les trois
 * réponses se distinguent parce que `reserve` est le seul cas que la règle atteint
 * — `ailleurs` n'est pas dans son champ, et le confondre avec `produits`
 * rendrait le refus illisible.
 *
 * Cette projection sert à la seule valeur qui a besoin d'un classement ; la clé
 * elle-même est épinglée par l'entrée d'avant, au caractère près.
 */
function espaceAtteint(cle: string): "reserve" | "produits" | "ailleurs" {
  if (cle.startsWith(DRAFT_PRODUCTS_PREFIX)) return "reserve"
  if (cle.startsWith(PRODUCTS_PREFIX)) return "produits"
  return "ailleurs"
}

/**
 * Une projection indexée par type de contenu autorisé, et son pendant attendu.
 *
 * La clé vient de `CONTENT_TYPES_IMAGE_PRODUIT` et l'attente de la même liste :
 * les deux côtés sont donc bâtis sur le fait, jamais sur une recopie. C'est ce
 * qui rend le parcours exhaustif par construction — un type autorisé de trop
 * n'aurait pas de projection, donc pas d'attente, et l'absence se verrait — et
 * ce qui le rend tenable : un type de plus n'a pas à être écrit.
 */
function projectionParType(
  contenu: Record<ContentTypeImageProduit, ReponseObservee>
): Record<string, unknown> {
  return Object.fromEntries(
    CONTENT_TYPES_IMAGE_PRODUIT.map((contentType) => [
      contentType,
      contenu[contentType],
    ])
  )
}

/** L'attente qui accompagne une projection indexée par type autorisé. */
function attenduParType(
  valeur: (contentType: ContentTypeImageProduit) => ReponseObservee
): Record<string, unknown> {
  return Object.fromEntries(
    CONTENT_TYPES_IMAGE_PRODUIT.map((contentType) => [
      contentType,
      valeur(contentType),
    ])
  )
}

export interface ValeurEpingleeStockage {
  readonly nom: string
  /**
   * L'état du stockage que la valeur demande, comme pour un scénario. Il est
   * `sain` partout ici et le resterait : une valeur attendue n'a pas à dire ce
   * qu'un stockage mort rend, cela relève de la couche d'accord — mais le champ
   * reste, parce que c'est lui qui décide que le rejeu reste une décision de la
   * suite et non de la valeur.
   */
  readonly etat: EtatStockageRejoue
  /**
   * L'observation projetée, prise **sur le port et rien qu'au port**. Un adaptateur
   * a un tableau, une carte, des enregistrements ; rien de tout cela n'est
   * observable d'un appelant, et une assertion qui les lirait affirmerait de
   * l'implémentation plutôt que du comportement.
   */
  jouer(
    stockage: PortStockageImageProduit,
    identite: IdentiteStockage
  ): Promise<unknown>
  /**
   * La valeur attendue, écrite ici. C'est donc une propriété du contrat et non
   * de la suite qui rejoue : une suite qui vérifierait les mêmes clés avec ses
   * propres littéraux aurait deux vérités à tenir.
   */
  readonly attendu: unknown
}

/**
 * Ce qui doit être vrai indépendamment des deux adaptateurs.
 *
 * Chaque entrée épingle une valeur, et aucune ne répète l'accord : si une
 * réponse des deux adaptateurs se.compare mieux, elle n'a rien à faire ici, et
 * si une valeur n'est pas une valeur, elle n'a rien à y faire non plus. Ce
 * qui reste est court, et c'est bien la partie qui compte — trois clés, une
 * frontière, deux refus.
 */
export const VALEURS_EPINGLEES: readonly ValeurEpingleeStockage[] = [
  {
    nom: "la clé de l'objet d'un Brouillon, pour chaque type de contenu autorisé",
    etat: "sain",
    // L'aperçu rendu est l'adresse que l'éditeur verra, et c'est la seule des
    // deux que la pré-signature expose au client : l'adresse d'envoi n'est pas
    // derivable d'une URL et n'a donc pas de forme à comparer. La clé est donc
    // lue comme le fait partout ailleurs — la base publique retirée — et non
    // comme une coupe de chaîne qui devrait deviner où la base s'arrête.
    async jouer(stockage, identite) {
      const projection: Record<ContentTypeImageProduit, ReponseObservee> = {
        "image/jpeg": { ok: false, code: "parametre-invalide" },
        "image/png": { ok: false, code: "parametre-invalide" },
        "image/webp": { ok: false, code: "parametre-invalide" },
        "image/avif": { ok: false, code: "parametre-invalide" },
        "image/gif": { ok: false, code: "parametre-invalide" },
      }
      for (const contentType of CONTENT_TYPES_IMAGE_PRODUIT) {
        projection[contentType] = await observer(
          () =>
            stockage.presignerBrouillon({
              draftId: IDENTITE_EPINGLEE,
              contentType,
              size: TAILLE,
            }),
          (valeur) => cleSous(valeur.previewUrl, identite.basePublique)
        )
      }
      return projectionParType(projection)
    },
    attendu: attenduParType((contentType) => ({
      ok: true,
      cle: cleBrouillonAttendue(contentType),
    })),
  },
  {
    nom: "la clé d'une Image produit persistée, pour chaque type de contenu autorisé",
    etat: "sain",
    // L'identifiant de la promotion est celui du Brouillon, et c'est ce que
    // l'ADR fixe — la promotion est une copie, donc la clé persistée est une
    // fonction pure de l'identifiant du Brouillon. Le parcours suit la liste des
    // types autorisés : une Image persistée existe pour chacun d'eux, sinon la
    // dérivation n'aurait de fait que pour cinq.
    async jouer(stockage, identite) {
      const projection: Record<ContentTypeImageProduit, ReponseObservee> = {
        "image/jpeg": { ok: false, code: "parametre-invalide" },
        "image/png": { ok: false, code: "parametre-invalide" },
        "image/webp": { ok: false, code: "parametre-invalide" },
        "image/avif": { ok: false, code: "parametre-invalide" },
        "image/gif": { ok: false, code: "parametre-invalide" },
      }
      for (const contentType of CONTENT_TYPES_IMAGE_PRODUIT) {
        projection[contentType] = await observer(
          () =>
            stockage.promouvoirBrouillon({
              draftId: IDENTITE_EPINGLEE,
              contentType,
            }),
          (valeur) => cleSous(valeur.publicUrl, identite.basePublique)
        )
      }
      return projectionParType(projection)
    },
    attendu: attenduParType((contentType) => ({
      ok: true,
      cle: clePersisteeAttendue(contentType),
    })),
  },
  {
    nom: "l'espace réservé est une extension stricte de l'espace des Images produit",
    etat: "sain",
    // Les deux préfixes sont un **fait public**, pas un détail : c'est le
    // document que Cloudflare reçoit, et ADR-0004 s'appuie dessus pour dire que
    // la règle ne peut pas expirer une Image persistée. C'est aussi ce que la
    // règle de cycle de vie relit sans jamais le retaper — elle tire son préfixe
    // du même export, donc le infrastructure ne connaît qu'une version de ce
    // fait et ne peut pas en valider une autre.
    //
    // La relation est observée et non affirmée : une sortie stricte du préfixe
    // des Images produit par le préfixe des Brouillons est ce qui rend
    // l'exclusion possible sans avoir à énumérer les identifiants. Un UUID n'a
    // pas de séparateur, donc rien ne peut reconstituer `products/brouillons/`
    // après `products/`, et c'est cela que la suite du cycle de vie vérifie sur
    // un éventail de valeurs — avec le préfixe de la règle, pour que la
    // vérification porte sur ce qui expire et non sur une copie.
    async jouer() {
      return {
        produits: PRODUCTS_PREFIX,
        brouillons: DRAFT_PRODUCTS_PREFIX,
        extensionStricte:
          DRAFT_PRODUCTS_PREFIX.startsWith(PRODUCTS_PREFIX) &&
          DRAFT_PRODUCTS_PREFIX.length > PRODUCTS_PREFIX.length,
      }
    },
    attendu: {
      produits: "products/",
      brouillons: "products/brouillons/",
      extensionStricte: true,
    },
  },
  {
    nom: "la clé d'une Image produit persistée n'atteint jamais l'espace réservé",
    etat: "sain",
    // C'est l'invariant dont dépend Cloudflare, épinglé par le port et non par
    // la dérivation : la clé que le stockage **promet** à un éditeur, celle qui
    // finit dans sa galerie, est celle-là. `infra/regle-cycle-vie-r2.test.ts`
    // vérifie la même frontière sur les fonctions de dérivation, avec le préfixe
    // de la règle pour que la vérification porte sur ce qui expire ; ici elle est
    // prise sur ce que le port rend, donc un adaptateur qui dériverait mal par
    // l'interface verrait cette suite rouge même si ses fonctions de dérivation
    // restaient justes.
    //
    // Un `produits` par type autorisé, écrit à l'avance, est l'assertion. Elle ne
    // répète pas la clé de l'entrée précédente : celle-là dit quelle chaîne est
    // rendue, celle-ci dit où elle atterrit — et c'est la question que Cloudflare
    // pose. Une Image persistée qui finirait sous l'espace réservé serait
    // expirée par la règle à la rétention, sans qu'aucune suite ne l'ait dit, et
    // le repérage est total : ni `reserve` ni `ailleurs` ne satisfont cette
    // attente.
    async jouer(stockage, identite) {
      const projection: Record<ContentTypeImageProduit, ReponseObservee> = {
        "image/jpeg": { ok: false, code: "parametre-invalide" },
        "image/png": { ok: false, code: "parametre-invalide" },
        "image/webp": { ok: false, code: "parametre-invalide" },
        "image/avif": { ok: false, code: "parametre-invalide" },
        "image/gif": { ok: false, code: "parametre-invalide" },
      }
      for (const contentType of CONTENT_TYPES_IMAGE_PRODUIT) {
        projection[contentType] = await observer(
          () =>
            stockage.promouvoirBrouillon({
              draftId: IDENTITE_EPINGLEE,
              contentType,
            }),
          (valeur) =>
            espaceAtteint(cleSous(valeur.publicUrl, identite.basePublique))
        )
      }
      return projectionParType(projection)
    },
    attendu: attenduParType(() => ({ ok: true, cle: "produits" })),
  },
  {
    nom: "supprimer une Image produit persistée : sous l'espace des produits oui, sous l'espace réservé non",
    etat: "sain",
    // Les deux sens de la même frontière, sur une opération seulement. Le refus
    // seul ne prouverait rien : une suppression qui refuserait tout passerait
    // aussi facilement. Le succès sous `products/` est ce qui donne au refus sa
    // portée — il dit « cette opération refuse *l'espace réservé* », pas « cette
    // opération refuse ».
    //
    // L'adresse du succès est la clé attendue de la promotion, donc l'URL
    // publique telle qu'un éditeur l'aurait dans sa galerie : la suppression
    // rejoue le trajet inverse et doit retomber sur la même clé.
    async jouer(stockage, identite) {
      return {
        sousProduits: await observer(() =>
          stockage.supprimerImagePersistee(
            `${identite.basePublique}/${clePersisteeAttendue("image/webp")}`
          )
        ),
        sousEspaceReserve: await observer(() =>
          stockage.supprimerImagePersistee(adresseReservee(identite))
        ),
      }
    },
    attendu: {
      sousProduits: { ok: true, cle: null },
      sousEspaceReserve: { ok: false, code: "parametre-invalide" },
    },
  },
  {
    nom: "supprimer une image de Structure : hors de l'espace réservé oui, dedans non",
    etat: "sain",
    // Même frontière, opération différente — et c'est la seconde qui était la
    // dangereuse. Une image de Structure est un champ URL libre, antérieur au
    // cycle de vie des Brouillons : elle peut nommer n'importe quoi sous la base
    // publique, l'espace réservé compris, et rien dans sa forme ne dit qu'elle
    // n'en fait pas partie.
    //
    // `sousProduits` est ici un succès alors qu'elle est un refus dans
    // l'entrée précédente : les deux gardes ne sont pas la même. Une Image
    // produit n'existe que sous `products/`, une image de Structure vit n'importe
    // où — y compris sous `products/`, comportement conservé pour les catégories —
    // mais jamais dans l'espace réservé. Épingler les deux sens ici est ce qui
    // distingue deux gardes distinctes, et un refactor qui les fusionnerait ne
    // verrait rien.
    async jouer(stockage, identite) {
      return {
        sousProduits: await observer(() =>
          stockage.supprimerImageCategorie(
            `${identite.basePublique}/${clePersisteeAttendue("image/webp")}`
          )
        ),
        horsProduits: await observer(() =>
          stockage.supprimerImageCategorie(
            `${identite.basePublique}/categories/image-produit-1.webp`
          )
        ),
        sousEspaceReserve: await observer(() =>
          stockage.supprimerImageCategorie(adresseReservee(identite))
        ),
      }
    },
    attendu: {
      sousProduits: { ok: true, cle: null },
      horsProduits: { ok: true, cle: null },
      sousEspaceReserve: { ok: false, code: "parametre-invalide" },
    },
  },
]

/**
 * Rejoue une valeur épinglée sur **un seul** adaptateur — la référence — et
 * exige que ce qu'il rend soit la valeur attendue.
 *
 * Un seul adaptateur, et non les deux : l'accord est l'affaire de la couche
 * d'accord, et rejouer les deux ici transformerait une valeur attendue en un
 * second accord, c'est-à-dire en un test qui ne verrait plus la fiction avoir
 * tort. La référence est le stockage réel, donc c'est elle qui doit porter les
 * valeurs ; l'adaptateur en mémoire est une fiction et n'a pas à être le juge
 * de la disposition d'ADR-0004.
 */
export async function exigerValeurEpingleeStockage(
  valeur: ValeurEpingleeStockage,
  adaptateur: AdaptateurStockage,
  identite: IdentiteStockage
): Promise<unknown> {
  const observation = await valeur.jouer(adaptateur(valeur.etat), identite)
  expect(observation, `${valeur.nom} — valeur épinglée`).toEqual(valeur.attendu)
  return observation
}
