/**
 * La Marche de la Structure — la traversée d'une Structure par `parentId`, qui
 * s'arrête sur toute revisite et rend ce qu'elle a parcouru (ADR-0030).
 *
 * **Elle répond des faits, jamais des verdicts.** Un cycle n'est pas une faute
 * ici : c'est une revisite, donc une fin de marche. Ce qu'il *signifie* reste à
 * l'appelant — une mutation le refuse, parce qu'un éditeur a une saisie à qui
 * rendre une faute ; une lecture dégrade et rend sa page, parce qu'un visiteur
 * n'a personne à qui se plaindre. Les deux surfaces se contredisent
 * délibérément, et c'est la décision, pas un accident : un module qui rendrait
 * le verdict les rendrait identiques, et supprimerait la divergence que
 * l'ADR-0030 consigne comme le cœur de sa décision.
 *
 * **Elle est neutre, et c'est une condition, pas une élégance.** Ni
 * `"use client"`, ni `"use server"`, ni `@/lib/db`, ni `next/headers`, ni
 * `server-only`, ni `node:`, ni React — le même contrat que `lib/carte-produit.ts`
 * (ADR-0022) et `lib/formulaire-produit.ts` (ADR-0026), et
 * `lib/marche-structure-frontiere.test.ts` le prouve par le graphe d'imports.
 *
 * **Cette neutralité était motivée par un appelant, et l'appelant est parti**
 * (#573, amendement d'ADR-0030). La boîte de suppression traversait le cœur
 * depuis #551 : c'était elle qui rendait l'exigence actuelle plutôt
 * qu'ambiguë. Elle ne le fait plus — elle reçoit ses deux listes de cibles et la
 * table des noms, que la page lui passe — donc la raison disparaît, et **la
 * condition reste**. C'est ADR-0028 qui la tient : une projection pure de la
 * Structure est une valeur que le serveur et le client peuvent avoir en commun,
 * donc elle habite un module qu'aucun des deux ne réclame. Le module qui possède
 * la lecture est au-dessus, et il lit la base, donc il ne peut pas servir de
 * domicile. Le jour où une surface cliente aura de nouveau besoin de la
 * descendance ou de la partition, elle les trouvera ici, sans qu'une décision
 * soit à reprendre et sans qu'une deuxième règle naisse dans un composant
 * `"use client"`. Une garde de frontière suit ce mouvement dans les deux sens :
 * celle-ci prouve qu'aucun client n'atteint le cœur, celle du module de lecture
 * prouve qu'il n'atteint aucun client (#574).
 *
 * **Elle est synchrone et sans I/O.** Des faits en entrée (`parentId` déjà en
 * mémoire), des faits en sortie : aucune requête, aucune attente, aucun état
 * hors de la marche. C'est ce qui la rend exerçable sans base — la première
 * preuve de terminaison du dépôt qui n'a pas besoin d'un PostgreSQL — et assez
 * peu chère pour être construite une fois par requête et interrogée autant de fois qu'un écran en a
besoin — une fois pour l'arbre d'accueil, une fois par Structure pour les cibles de suppression
d'une page d'Administration, une fois pour un fil, une fois pour une branche.
 *
 * **Ce qui rend cette promesse vraie, c'est l'index inverse des liens : il est
 * bâti une fois, à la construction de la marche, et non dans chacune de ses
 * méthodes (#584).** Ce n'est pas un détail d'implémentation : une méthode
 * ajoutée plus tard rebâtirait le sien sans qu'on le voie, et le hors arbre
 * comme la descendance pourraient dériver de deux topologies concurrentes alors
 * qu'il n'y en a qu'une. Les bâtir à la construction les en empêche tous les
 * deux — et `lib/marche-structure.test.ts` compte les constructions par la seule
 * couture où elles se voient : la carte des liens que l'appelant fournit.
 *
 * **Une seule chose y est retenue, et c'est le journal.** Chaque marche se
 * souvient des cycles qu'*elle* a déjà signalés : une requête qui atteint le
 * même cycle par trois surfaces produit une ligne, pas trois. Ce n'est pas un
 * cache de module — la retenue meurt avec la marche, donc avec la requête — et
 * c'est délibéré : un `Set` au niveau du module ferait dépendre les suites de
 * leur ordre d'exécution, et tairait l'avertissement pour toute la vie du
 * processus. Le journal reste donc un fait de la requête, comme la marche.
 *
 * **Les noms sont un confort, pas une condition.** `noms` reste facultatif :
 * un appelant qui n'a pas le nom sous la main obtient quand même sa traversée,
 * et le journal retombe alors sur l'identifiant. Un `cuid` se lit mal, mais il
 * est vrai — la marche n'a pas à inventer un nom qu'aucune lecture ne lui a
 * donné.
 *
 * **Un cycle très long est résumé, et c'est délibéré.** Le critère de #544 est
 * « un cycle journalisé une fois, nommant les Structures impliquées » : au-delà
 * de dix maillons, la ligne dit la taille du cycle et ses dix premiers, ce qui
 * nomme les Structures impliquées sans verser vingt mille identifiants dans le
 * journal. Une ligne de vingt mille maillons n'est pas un journal, c'est un
 * vidage — et la première ligne utile reste « il y a un cycle, et le voici ».
 *
 * **Deux projections se parent dessus, et l'ordre qu'elles rendent est le leur,
 * pas celui de la traverse.** La première rend une Structure et sa
 * descendance, chacune au plus une fois : c'est ce qu'une surface exclut, et ce
 * qu'elle n'a plus à refaire à la main. La seconde rend la partition qu'une page
 * passe à ses boîtes — tout sauf la Structure, et tout sauf elle et sa
 * descendance. Les deux listes se partagent une cause, et leur différence est un
 * fait : ce qui les sépare, c'est exactement les descendantes. Elles se lisent
 * dans **l'ordre du cœur** — le nom en français, départagé par l'identifiant, écrit
 * une fois dans `comparerParNom` — parce que l'ordre de la traverse n'est pas un
 * ordre : il dépend de l'ordre des rangées qu'une lecture a rendues, donc de la
 * collation d'un serveur de base qu'aucun déploiement n'épingle. L'identifiant
 * départage les Structures de même nom parce que le cœur ne connaît pas le slug,
 * et qu'il est unique : l'ordre reste total et ne dépend d'aucune machine. Le
 * module qui possède la lecture **reprend ce comparateur tel quel** plutôt que d'en
 * écrire un sien : c'est le même fait classé par la même règle, et non deux
 * règles qui ne se contredisent que sur une liste dont les noms se répètent.
 *
 * **Elles vivent ici, et c'est une décision, pas un hasard.** ADR-0028 décide
 * qu'une valeur partagée par le serveur et par le client habite un module
 * qu'aucun des deux ne réclame ; le module de lecture, au-dessus, lit la base,
 * donc un composant `"use client"` ne peut pas l'atteindre. Le cœur est neutre,
 * et sa neutralité se prouve — le jour où une surface cliente aura besoin d'une
 * projection pure de la Structure, elle la trouvera ici sans qu'une décision
 * soit à reprendre. Aucune des deux ne refait la descente : chacune construit
 * une marche et l'interroge une fois, donc la règle de terminaison reste écrite
 * en un seul endroit, et c'est elle qui la porte.
 *
 * **La partition a deux portes, comme la marche en a deux — et c'est le même
 * arbitrage.** `complementDe` prend des rangées et bâtit sa marche ;
 * `complementDepuis` prend une marche et les liens que l'appelant a déjà bâtis.
 * Ce n'est pas un redondant : c'est la question que pose toute surface qui a
 * **plus d'une** réponse à tirer des mêmes faits. La liste d'Administration en a
 * quatre — la place de chaque ligne, et où vont ses Produits et ses
 * sous-catégories — et répondre à la dernière par `complementDe` bâtirait une
 * marche par ligne, donc une retenue par ligne, donc **autant de lignes de
 * journal pour un seul cycle** : l'avertissement cesserait de dire combien de
 * Structures un éditeur doit réparer, et c'est la seule chose qu'il doive pouvoir
 * y lire (ADR-0030, US 34). Une surface qui n'a qu'une partition à demander
 * appelle `complementDe`, qui bâtit sa marche et n'a rien à partager ; une
 * surface qui en a autant que de lignes appelle `complementDepuis`. Les deux
 * portes rendent **la même chose** — `lib/marche-structure-partition.test.ts` le
 * rejoue sur toute la fixture — et la partition qu'elles portent voyage avec elle,
 * donc aucune page n'a à demander les deux.
 */

/**
 * Ce qu'une lecture de la Structure rend, réduit à ce que la marche consomme :
 * une rangée par Structure, avec son nom et sa parente. Les surfaces qui
 * lisaient la Structure le projetaient chacune à leur façon — deux cartes
 * bâties à la main, cinq fois — et cinq copies d'un même fait divergent
 * (ADR-0022).
 */
export interface StructureLue {
  id: string
  name: string
  parentId: string | null
}

/**
 * Les faits que la marche consomme : le lien de chaque Structure vers sa
 * parente, et — quand l'appelant les a sous la main — les noms qui rendent le
 * journal lisible.
 *
 * `parentParId` porte l'absence de parente par `null`, et une clé absente vaut
 * `null` : une Structure dont la parente n'est pas dans la carte termine donc
 * sa marche comme une racine — `ancetres` s'arrête, `horsArbre` n'invente
 * aucun cycle. C'est ce que le code fait, et c'est solide : la clé étrangère
 * `Category_parentId_fkey` garantit qu'un `parentId` nomme une rangée
 * existante, donc une clé absente ne peut dire qu'une chose — la lecture de
 * l'appelant ne couvrait pas cette rangée. La traiter en racine est la
 * dégradation que ce module promet ; l'alternative, une erreur, est exactement
 * ce qu'ADR-0030 interdit à une lecture de faire.
 */
export interface LiensStructure {
  parentParId: ReadonlyMap<string, string | null>
  noms?: ReadonlyMap<string, string>
}

/** Ce qu'une marche rend : des identifiants, chacun au plus une fois. */
export interface MarcheStructure {
  /**
   * La Structure et ses ancêtres, la Structure courante **en dernier** — la
   * forme du fil d'Ariane. Toute revisite l'arrête : une chaîne cyclique rend
   * ses maillons une fois chacun, et la Structure courante reste la dernière.
   */
  ancetres(id: string): string[]
  /**
   * La Structure et toutes ses descendantes, chacune au plus une fois. Un cycle
   * atteint par la descente s'arrête sur sa propre revisite.
   */
  descendance(id: string): string[]
  /**
   * Les Structures qu'aucune racine n'atteint — un cycle, une chaîne qui mène
   * dans un cycle, ou toute branche qu'un cycle soustrait à l'arbre. Ce sont
   * les **Structures hors arbre** du glossaire : présentes en base, absentes de
   * toute branche.
   */
  horsArbre(): string[]
}

/**
 * Le nombre de maillons au-delà duquel le journal résume le cycle au lieu de
 * l'énumérer. Un cycle est une corruption à réparer à la main : au-delà de
 * quelques Structures, la ligne complète noie le journal sans rien dire de
 * plus, et la première ligne utile reste « il y a un cycle, et le voici ».
 */
const MAILLONS_ENUMERES = 10

/**
 * Le nom d'une Structure pour le journal : celui que l'appelant a fourni, ou
 * son identifiant faute de mieux. Un journal qui ne nommerait que des `cuid`
 * obligerait à ouvrir une console de base pour lire ce qu'il dit.
 */
function nommer(
  id: string,
  noms: ReadonlyMap<string, string> | undefined
): string {
  return noms?.get(id) ?? id
}

/**
 * L'index inverse des liens — chaque parente, et ses enfants — et les racines
 * que les liens déclarent. `descendance` et `horsArbre` descendent le même
 * graphe : en bâtir deux versions était écrire deux fois le même fait, et se
 * donner deux occasions de diverger (ADR-0022). Il n'en est bâti qu'**une**,
 * à la construction de la marche (#584).
 */
function indexDesLiens(parentParId: ReadonlyMap<string, string | null>): {
  enfants: Map<string, string[]>
  racines: string[]
} {
  const enfants = new Map<string, string[]>()
  const racines: string[] = []
  for (const [id, parente] of parentParId) {
    if (parente === null) {
      racines.push(id)
      continue
    }
    const fratrie = enfants.get(parente)
    if (fratrie) fratrie.push(id)
    else enfants.set(parente, [id])
  }
  return { enfants, racines }
}

/**
 * Une descente depuis `depart` : ce qu'elle atteint, chacune au plus une fois,
 * et les enfants qu'elle a retrouvés déjà atteints — le pas qui referme un
 * cycle. `descendance` part d'une Structure, `horsArbre` de toutes les racines :
 * c'est la même passe, avec la même règle de terminaison — toute revisite
 * l'arrête —, et elle n'est donc écrite qu'une fois.
 */
function atteindre(
  depart: readonly string[],
  enfants: ReadonlyMap<string, readonly string[]>
): { atteints: string[]; revisites: Set<string> } {
  const atteints: string[] = []
  const vus = new Set<string>()
  /** Les enfants déjà atteints : chacun est le pas qui referme un cycle. */
  const revisites = new Set<string>()
  const file = [...depart]
  while (file.length > 0) {
    const courant = file.shift()!
    if (vus.has(courant)) continue
    vus.add(courant)
    atteints.push(courant)
    for (const enfant of enfants.get(courant) ?? []) {
      if (vus.has(enfant)) {
        revisites.add(enfant)
        continue
      }
      file.push(enfant)
    }
  }
  return { atteints, revisites }
}

/**
 * Construit une marche sur des liens déjà en mémoire.
 *
 * La marche est une valeur : elle se construit une fois, s'interroge autant de
 * fois qu'une requête en a besoin, et ne retient rien d'autre que les cycles
 * qu'elle a déjà signalés.
 */
export function marcheStructure(liens: LiensStructure): MarcheStructure {
  const { parentParId, noms } = liens
  const cyclesSignales = new Set<string>()

  /**
   * L'index inverse, **bâti ici, une fois, à la construction** (#584).
   *
   * Il l'était dans `descendance` puis dans `horsArbre` — donc une fois par
   * question, et l'écran d'Administration en demandait une par ligne : N+1 sur N
   * lignes, à O(N) chacune. La question n'était donc pas « où le bâtir », mais
   * « à qui il appartient » : c'est un fait de la marche, et non de ses
   * méthodes.
   *
   * **Le construire tout de suite plutôt qu'à la première descente qui en a
   * besoin** : la fenêtre qu'ouvre un « la première fois qu'on le demande » est
   * celle qu'une méthode future referait sans le voir, et il ne resterait alors
   * rien pour dire que le hors arbre et la descendance lisent la même chose.
   * Le prix est une passe sur les liens même pour une marche qui ne demanderait
   * que des ancêtres, le fil d'Ariane — une passe, linéaire, et c'est le prix
   * que l'en-tête annonce déjà.
   */
  const { enfants, racines } = indexDesLiens(parentParId)

  /**
   * Le cycle qu'un pas vers la parente vient de refermer, s'il y en a un.
   *
   * `chemin` est la remontée déjà faite, la Structure de départ en premier ;
   * `visite` est la parente sur laquelle ce pas retombe. Deux surfaces
   * l'empruntent — la remontée qui s'arrête, et la descente qui retombe sur un
   * identifiant déjà atteint — et elles doivent journaliser **le même** cycle :
   * d'où le chemin reconstruit à l'identique dans les deux cas.
   */
  function cycleRefermePar(
    chemin: string[],
    visite: string | null
  ): string[] | null {
    if (visite === null) return null
    const debut = chemin.indexOf(visite)
    return debut === -1 ? null : [...chemin.slice(debut), visite]
  }

  /**
   * Une remontée complète, et le cycle qu'elle a refermé s'il y en a un. Rend
   * les deux parce que les deux se lisent dans la même marche : l'appelant qui
   * veut les ancêtres n'a pas à la refaire pour savoir s'il y avait un cycle.
   */
  function remonter(id: string): { chemin: string[]; cycle: string[] | null } {
    const chemin: string[] = []
    const vus = new Set<string>()
    let curseur: string | null = id
    while (curseur !== null && !vus.has(curseur)) {
      chemin.push(curseur)
      vus.add(curseur)
      // Une parente absente de la carte termine la marche comme une racine :
      // la clé étrangère garantit qu'elle existe en base, donc la lecture de
      // l'appelant ne la couvrait pas (voir `LiensStructure`).
      curseur = parentParId.get(curseur) ?? null
    }
    return { chemin, cycle: cycleRefermePar(chemin, curseur) }
  }

  /**
   * Le journal, une fois par cycle et par marche. La signature est l'ensemble
   * **trié** des maillons : le même cycle atteint par un autre de ses maillons
   * — ou par une branche qui y mène — porte la même signature, et ne produit
   * donc pas une seconde ligne.
   */
  function signaler(cycle: string[]): void {
    const maillons = cycle.slice(0, -1)
    const signature = [...maillons].sort().join("\u0000")
    if (cyclesSignales.has(signature)) return
    cyclesSignales.add(signature)
    // Un cycle très long est résumé : la ligne reste lisible, et elle dit
    // toujours ce qui compte — qu'il y a un cycle, et de quelle taille.
    const resume =
      maillons.length > MAILLONS_ENUMERES
        ? `${maillons.length} Structures, dont ${cycle
            .slice(0, MAILLONS_ENUMERES)
            .map((id) => nommer(id, noms))
            .join(" → ")} → …`
        : cycle.map((id) => nommer(id, noms)).join(" → ")
    console.warn(`[marche-structure] cycle : ${resume}`)
  }

  function ancetres(id: string): string[] {
    const { chemin, cycle } = remonter(id)
    if (cycle) signaler(cycle)
    // La remontée se lit de la Structure vers sa racine ; le fil d'Ariane se
    // lit dans l'autre sens, la Structure courante en dernier.
    return chemin.reverse()
  }

  function descendance(id: string): string[] {
    const { atteints, revisites } = atteindre([id], enfants)

    // Un cycle refermé par la descente : un enfant déjà atteint. Le cycle est
    // celui que la remontée depuis cet enfant referme — la même lecture que
    // `ancetres`, donc le même journal, et une seule ligne pour les deux.
    for (const revisite of revisites) {
      const { cycle } = remonter(revisite)
      if (cycle) signaler(cycle)
    }

    return atteints
  }

  /**
   * Les Structures hors arbre, en **une** passe sur les liens : on part de
   * toutes les racines, on descend ce qui est atteignable, et tout le reste est
   * hors arbre. Une boucle par Structure, chacune appelant `ancetres`, dirait
   * la même chose en coûtant un parcours complet par Structure — et la
   * détection doit rester assez bon marché pour être appelée sur chaque lecture
   * (ADR-0030, #544).
   *
   * Les racines viennent de l'index que la marche bâtit — le même que
   * `descendance` lit, et non une seconde version (#584).
   */
  function horsArbre(): string[] {
    const { atteints } = atteindre(racines, enfants)
    const dansLArbre = new Set(atteints)

    const horsArbre: string[] = []
    for (const id of parentParId.keys()) {
      if (!dansLArbre.has(id)) horsArbre.push(id)
    }

    // Chaque Structure hors arbre est dans un cycle ou mène à un cycle : c'est
    // ce que dit son absence de l'arbre, et c'est ce que le journal nomme. La
    // remontée s'arrête au premier maillon déjà classé, donc chaque Structure
    // n'est remontée qu'une fois en tout — et non une fois par Structure hors
    // arbre, ce qui serait quadratique sur une longue chaîne corrompue.
    const dansUnCycle = new Set<string>()
    for (const id of horsArbre) {
      if (dansUnCycle.has(id)) continue
      const chemin: string[] = []
      const vus = new Set<string>()
      let curseur: string | null = id
      while (
        curseur !== null &&
        !dansUnCycle.has(curseur) &&
        !vus.has(curseur)
      ) {
        chemin.push(curseur)
        vus.add(curseur)
        curseur = parentParId.get(curseur) ?? null
      }
      const cycle = cycleRefermePar(chemin, curseur)
      if (!cycle) continue
      signaler(cycle)
      // Seuls les maillons du cycle sont classés : l'amont qui y mène n'en fait
      // pas partie, et une autre branche peut encore le remonter.
      for (const maillon of cycle.slice(0, -1)) dansUnCycle.add(maillon)
    }

    return horsArbre
  }

  return { ancetres, descendance, horsArbre }
}

/**
 * La marche d'une lecture : les rangées que l'appelant a déjà en main, sans
 * requête de plus. Une seule projection pour les surfaces qui lisent la
 * Structure, parce que cinq copies d'un même fait divergent (ADR-0022).
 *
 * C'est le chemin ordinaire : une lecture qui a ses rangées n'a pas à bâtir
 * deux cartes — les liens et les noms — pour interroger la marche.
 * `marcheStructure` reste l'entrée des faits déjà séparés, et celle que la
 * suite du module exerce sans noms.
 */
export function marcheDesStructures(
  structures: readonly StructureLue[]
): MarcheStructure {
  return marcheStructure(liensDesStructures(structures))
}

/**
 * Les faits séparés comme la marche les consomme, tirés de rangées : le lien de
 * chaque Structure vers sa parente, et le nom qui rend le journal lisible.
 *
 * Cette forme est **exportée** pour qui a besoin des liens **eux-mêmes** et pas
 * seulement d'une marche : une surface qui interroge la même marche pour
 * plusieurs questions a une seule fois à les séparer, et à les garder pour les
 * questions suivantes. C'est le cas du module de lecture, qui répond de la place
 * de chaque ligne *et* de la partition de chaque ligne aux mêmes faits — le
 * réécrire lui-même aurait produit deux cartes des liens et deux cartes des noms,
 * donc deux sources de vérité pour le même lien (ADR-0022). C'est aussi l'entrée
 * que prend le complément plus bas.
 */
export function liensDesStructures(
  structures: readonly StructureLue[]
): LiensStructure {
  return {
    parentParId: new Map(
      structures.map((structure) => [structure.id, structure.parentId])
    ),
    noms: nomsDesStructures(structures),
  }
}

/**
 * Les noms des Structures, en une carte — celle que la marche lit déjà pour nommer
 * un cycle, et que l'ordre lit pour classer une liste.
 */
function nomsDesStructures(
  structures: readonly StructureLue[]
): ReadonlyMap<string, string> {
  return new Map(structures.map((structure) => [structure.id, structure.name]))
}

/**
 * Ce que l'ordre classe : les **deux** faits qu'il compare, le nom puis
 * l'identifiant. La forme est déclarée ici parce que l'ordre est comparé sur des
 * faits — une rangée, un nœud rendu, un fait — et que le comparateur doit donc
 * accepter n'importe lequel d'eux, pas une liste de tables différentes.
 */
export interface StructureOrdonnee {
  /** La clé qui départage : unique, donc l'ordre total. */
  id: string
  /** Le nom que l'ordre classe d'abord. */
  name: string
}

/**
 * **L'ordre du module**, écrit une fois : le nom en français, départagé par
 * l'identifiant.
 *
 * **Il vit ici, et c'est un fait, pas une revendication.** Le cœur est le seul
 * module qui ait à classer une liste *et* à le faire pour des surfaces qu'il ne
 * connaît pas : ses trois listes sont rendues ici, et le module qui les consomme —
 * `lib/use-cases/lecture-structure.ts` — classe de son côté, sur les mêmes
 * petits. Un comparateur par projection aurait été le naturel du code : six
 * fonctions, six occasions de divergir, et aucune épreuve ne s'en aperçoit
 * parce que deux classements différents ne se contredisent sur aucune liste
 * dont les noms soient distincts. C'est pourquoi celui-ci est **exporté** et
 * repris tel quel par le module : une seule promesse d'ordre, lisible d'un coup
 * (US 31).
 *
 * **L'identifiant départage, et non le slug, parce que le cœur ne connaît pas le
 * slug.** `StructureLue` ne le porte pas, et l'ajouter pour départager
 * contraindrait chaque appelant — y compris une surface cliente qui n'aurait
 * qu'un `cuid` sous la main — à fournir un fait dont la comparaison n'a pas
 * besoin. L'identifiant est unique, donc l'ordre reste total, et il ne dépend
 * d'aucune machine : c'est la même promesse que le nom en français, qui elle
 * non plus ne dépend d'aucun serveur de base (US 30).
 */
export function comparerParNom(
  a: StructureOrdonnee,
  b: StructureOrdonnee
): number {
  return a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id, "fr")
}

/**
 * Les mêmes identifiants, dans l'ordre du module.
 *
 * Les listes du cœur sont rendues en **identifiants** — c'est ce qui franchit la
 * couture client/serveur (ADR-0028) — donc il leur faut un classement par
 * identifiants ; l'ordre, lui, se compare sur des faits. Le passage se fait ici,
 * une fois : chaque identifiant devient son couple `{ id, name }` — le nom par
 * `nommer`, qui sert de repli à un identifiant que la carte ne porte pas —, le
 * classement passe par `comparerParNom`, et le nom est retiré. La carte des noms
 * reste facultative pour la même raison qu'elle l'est pour la marche : un fait
 * que l'appelant n'a pas ne fait pas défaut.
 */
function dansLOrdreDuModule(
  ids: readonly string[],
  noms: ReadonlyMap<string, string> | undefined
): string[] {
  return ids
    .map((id) => ({ id, name: nommer(id, noms) }))
    .sort(comparerParNom)
    .map((ordonne) => ordonne.id)
}

/**
 * La branche d'une Structure, remise dans l'ordre du module : elle d'abord, puis
 * ses descendantes.
 *
 * Les maillons sont ceux de la traverse, tous atteints une fois par sa règle de
 * terminaison ; seule leur place change. La Structure demandée ouvre la liste,
 * parce que c'est elle qu'on a nommée et qu'une surface qui exclut cette liste a
 * besoin de la retrouver sans la deviner.
 *
 * Une Structure absente des faits rend donc `[id]` — la dégradée de la marche,
 * qu'aucune projection ne transforme en refus.
 */
function brancheDansLOrdre(
  marche: MarcheStructure,
  noms: ReadonlyMap<string, string> | undefined,
  id: string
): string[] {
  return [
    id,
    ...dansLOrdreDuModule(
      marche.descendance(id).filter((atteinte) => atteinte !== id),
      noms
    ),
  ]
}

/**
 * **La primitive de la Structure** : elle et toutes ses descendantes, chacune au
 * plus une fois, dans l'ordre que le module promet.
 *
 * C'est le fait central que le module de lecture expose, et une surface qui exclut
 * une branche — le formulaire d'édition, qui interdit les parentes possibles —
 * n'a plus à bâtir sa propre marche pour l'obtenir. La règle de terminaison reste
 * celle de la marche : toute revisite arrête, un cycle déjà en base rend ses
 * maillons et ne lève rien.
 */
export function descendanceDe(
  structures: readonly StructureLue[],
  id: string
): string[] {
  return brancheDansLOrdre(
    marcheDesStructures(structures),
    nomsDesStructures(structures),
    id
  )
}

/**
 * Les trois listes d'une partition, en données ordinaires : des identifiants,
 * chacun au plus une fois, et rien d'appelable. C'est ce qui franchit la couture
 * client/serveur — des chaînes, comme la constante d'ADR-0028, en plus grand.
 */
export interface PartitionStructure {
  /** La Structure et ses descendantes : la primitive, telle qu'elle est calculée. */
  descendance: string[]
  /** Toute Structure sauf celle-ci. */
  horsSoi: string[]
  /** Toute Structure qui n'est ni elle-même ni l'une de ses descendantes. */
  horsDescendance: string[]
}

/**
 * **Le complément de la primitive**, calculé une fois : tout sauf la Structure, et
 * tout sauf elle et sa descendance.
 *
 * Les deux listes viennent de la même cause, et c'est ce qui fait une partition
 * plutôt que deux filtres : leur différence est exactement la descendance, ni plus
 * ni moins. Une page n'a donc qu'une projection à appeler pour ses boîtes, et la
 * primitive qu'elle a calculée voyage avec elle — pas une seconde marche, donc pas
 * une seconde ligne de journal pour un seul cycle.
 *
 * **Elle ne retire rien d'autre, et c'est délibéré.** Sur un cycle déjà en base,
 * une cible qui descend de la Structure est écartée des sous-catégories — c'est la
 * seule raison pour laquelle elle l'est — et reste proposée pour un Produit comme
 * toute autre. Rien n'est jugé ici : la liste propose, et le serveur seul refuse
 * (ADR-0030).
 *
 * **Deux portes, comme la marche en a deux.** Celle-ci prend des rangées et bâtit
 * sa marche ; `complementDepuis` prend une marche que l'appelant a déjà. Voir ce
 * dernier pour pourquoi la seconde existe : c'est elle que prend une surface qui
 * a plus d'une question à poser aux mêmes faits, parce que la retenue qui tait un
 * cycle **vit dans la marche** — en bâtir une seconde dirait le même cycle une
 * seconde fois.
 */
export function complementDe(
  structures: readonly StructureLue[],
  id: string
): PartitionStructure {
  const liens = liensDesStructures(structures)
  return complementDepuis(marcheStructure(liens), liens, id)
}

/**
 * **La même partition, sur une marche et des liens que l'appelant a déjà.**
 *
 * Une surface qui rend plus d'une projection sur les mêmes faits a déjà sa marche :
 * la liste d'Administration pose une question à la table entière — sous quoi est
 * cette Structure, est-elle hors arbre, où va un Produit, où va une
 * sous-catégorie — et répondre à la dernière par `complementDe` bâtirait une
 * seconde marche, donc une seconde retenue, donc **une seconde ligne de journal
 * pour le même cycle**. L'avertissement cesserait alors de dire combien de
 * Structures un éditeur doit réparer, et c'est la seule chose qu'il doit pouvoir
 * y lire.
 *
 * La forme est donc celle de la marche elle-même : les faits en entrée, aucun
 * état caché, une ligne de journal par cycle et par marche. Les liens viennent
 * avec la marche parce qu'ils portent les deux listes — `parentParId` tient toutes
 * les Structures à offrir, `noms` leur ordre — ; la primitive est calculée par la
 * marche qu'on lui donne, jamais par une autre.
 */
export function complementDepuis(
  marche: MarcheStructure,
  liens: LiensStructure,
  id: string
): PartitionStructure {
  const noms = liens.noms
  const descendance = brancheDansLOrdre(marche, noms, id)
  const dansLaDescendance = new Set(descendance)
  // Les identifiants viennent des liens : une seule source de vérité pour « la
  // table entière », donc aucune liste qui s'écarterait d'un fait que la
  // projection d'à côté n'aurait pas lu.
  const tous = [...liens.parentParId.keys()]

  return {
    descendance,
    horsSoi: dansLOrdreDuModule(
      tous.filter((autre) => autre !== id),
      noms
    ),
    horsDescendance: dansLOrdreDuModule(
      tous.filter((autre) => !dansLaDescendance.has(autre)),
      noms
    ),
  }
}
