# Images produit dans Cloudflare R2, servies publiquement, clé dérivée de l'URL

Les images produit sont stockées dans Cloudflare R2 et servies comme URL publiques via un domaine dédié (`cdn.eguidar.com`). On garde le bucket public plutôt qu'un bucket privé avec des URL signées : les images d'un catalogue sont destinées à être publiques, et l'URL publique est directement cacheable par le CDN. La base de données stocke l'URL publique complète et jamais la clé de l'objet ; à la suppression, la clé est dérivée de l'URL en retirant le préfixe `R2_PUBLIC_URL`, ce qui évite toute migration de schéma. La suppression des objets se fait de manière synchrone dans les use-cases admin (diff entre l'ancien et le nouveau jeu d'images), en best-effort : un échec de suppression R2 ne bloque pas la mutation du catalogue.

## Amendement : deux états de propriété, un seul module propriétaire

Le texte ci-dessus ne décrit qu'un état de propriété — l'**Image produit** persistée sur un **Produit** — et lui attribue toute suppression. Il manque le second état : une image téléchargée pendant une édition n'appartient encore à aucun **Produit**. Tant que ce second état n'existe pas, le formulaire d'edition doit prouver la propriete d'un objet avec son URL publique, et une suppression faite avant l'enregistrement du **Produit** detruit un objet encore reference par le Catalogue.

Ce module ne dicte pas l'identite du domaine : il fixe la **forme** que doit avoir le module de cycle de vie.

### Les deux etats et leur proprietaire

| | **Brouillon d'Image produit** | **Image produit** |
|---|---|---|
| Proprietaire | l'editeur d'Administration qui l'a televerse | le **Produit** du Catalogue |
| Identite posee | un identifiant opaque, jamais une URL | l'URL publique persistee |
| Espace R2 | `products/brouillons/` (reserve) | `products/` (existant) |
| Expiration | oui, apres la retention configuree | non |
| Suppression | avant commit, explicite, signalee a l'editeur ; apres commit, l'objet source est libere en best-effort | apres commit, en best-effort |

### Le registre durable

Un **Brouillon d'Image produit** est un enregistrement durable, et non un objet nu dans le bucket. Chaque enregistrement porte : un **identifiant opaque** (UUID, cle de la table, sans lien derivable avec l'URL), l'**identite de stockage** (cle d'objet, derivee de cet identifiant et non du contraire), le **proprietaire** (l'editeur d'Administration, ou la tentative d'edition), la **date de creation**, la **date d'expiration**, et l'**etat de cycle de vie**. Le registre est donc consultable : le support peut expliquer pourquoi un objet est present ou absent, sans passer par R2.

### La retention

La retention d'un brouillon abandonne est de **24 heures**, configuree, et non un fait cache dans un formulaire ou une route. Elle est deliberement plus longue que la duree de vie de cinq minutes d'une URL d'envoi pre-signee : c'est ce qui permet de reessayer un enregistrement echoue sans téléverser l'image a nouveau. Un nettoyage au moment de la requete reste une optimisation possible ; il n'est pas la source de verite.

### L'expiration hors bande

Aucun file, aucun worker, aucun planificateur generique. Une **regle de cycle de vie Cloudflare R2** cible le seul prefixe `products/brouillons/`. Les Images produit persistees vivent sous `products/` et ne peuvent donc pas matcher la regle : la cle d'un objet persistant est `products/<uuid><ext>`, et un UUID ne contient pas de separateur, donc aucune cle persistante ne peut commencer par `products/brouillons/`. Une regle de cycle de vie « globale » sur le bucket est explicitement exclue.

### La promotion, et son idempotence

Un brouillon n'est jamais enregistre tel quel. La **promotion** copie l'objet de `products/brouillons/<id><ext>` vers `products/<id><ext>`, l'identifiant etant conserve. La cle persistante est donc une **fonction pure de l'identifiant du brouillon**, et la promotion est **idempotente** : un nouvel essai resout vers le meme fait persistant, il ne cree jamais une seconde identite publique. Le **Produit** enregistre les URL publiques permanentes issues de la promotion, jamais l'URL du brouillon.

Puisque la promotion est une copie, l'objet source n'a plus besoin que le commit du **Produit** soit ecrit : il est alors libere en best-effort, une seule fois, sur ce chemin de reussite — jamais sur un chemin de compensation, ou le brouillon doit rester revendicable. Un echec de cette liberation ne remet pas l'enregistrement en cause ; la regle de cycle de vie R2 sur le prefixe reserve couvre ce qui reste.

### La revendication, et la premiere qui gagne

La revendication d'un brouillon est une **comparaison-et-echange** d'etat reserve a l'editeur proprietaire, sur un brouillon `vivant` et non expire. Le premier qui revendique gagne ; un second essai **refuse explicitement**. Une copie de l'identifiant ne peut donc pas transferer une image vers un **Produit** sans rapport, ni vers un second.

La revendication d'un brouillon et la persistance du **Produit** forment **une seule operation logique commitee** : l'interface du cycle de vie prend la fonction d'enregistrement du Catalogue, l'execute entre la revendication et la confirmation, et ne rend la main qu'une fois l'ensemble resolu ou compensé.

### Les quatre echecs, quatre traitements

| Echec | Traitement |
|---|---|
| La promotion echoue | le **Produit** n'est pas enregistre ; le brouillon reste revendicable ; l'echec est signale a l'editeur par le mecanisme de refus deja en place |
| La transaction echoue apres promotion | la copie promue est supprimee en best-effort ; le brouillon redevient revendicable ; la base reste autoritaire pour la mutation du **Produit** |
| La liberation explicite echoue | l'echec de stockage est **signale** a l'editeur ; le brouillon n'est pas silencieusement retire des faits du formulaire |
| La suppression d'une Image produit persistee echoue | elle reste post-commit et best-effort : elle ne fait jamais echouer une mutation **Catalogue** deja engagee |

Ce dernier point ne change rien a la regle d'origine de cet ADR : la base est autoritaire, un travail commite n'est jamais annule parce qu'un effet annexe a echoue. L'amendement ne fait que separer **avant** commit (l'editeur voit l'echec, le brouillon survit) et **apres** commit (l'editeur ne voit rien, la mutation tient).

### Ce qui ne change pas

- Les **Images produit** persistees restent servies publiquement, et la base continue de stocker l'URL publique complete, jamais la cle.
- La convention de derivation de la cle depuis l'URL reste centralisee dans un seul adaptateur R2.
- La limite de huit images par **Produit** et les regles de type et de taille restent inchangees.
- La mutation du **Catalogue** reste proprietaire de ses invariants : validation, slug, SKU, variantes, cache, indexation, transaction. Le cycle de vie fournit des faits d'image stables ; il ne devient pas proprietaire des regles du Catalogue.
- Les images de **Structure** (categories) gardent leur chemin propre et n'acquièrent pas le cycle de vie des brouillons.
- ADR-0014 reste intact : les adaptateurs de production vivent dans le module proprietaire, et l'interface du cycle de vie ne fait jamais passer une erreur brute de stockage ni une cle R2 vers ses appelants.

### La forme du module

Une seule couture externe, quatre operations, et le plus petit nombre possible de coutures internes : une couture par stockage et une par horloge, pas une couture par operation de stockage ni par etat de formulaire.

1. **Demander un brouillon** — l'editeurproprietaire, un type et une taille ; repond un identifiant opaque, une URL d'envoi pre-signee et la date d'expiration.
2. **Relacher un brouillon** — l'editeur proprietaire et l'identifiant ; refuse si le brouillon n'est pas a lui, s'il n'est pas vivant, ou si le stockage echoue.
3. **Revendiquer et enregistrer** — la tentative d'edition, les identifiants de brouillon et la fonction d'enregistrement du **Catalogue** ; repond le resultat de cette fonction. C'est cette operation qui rend « une seule operation logique commitee » structurel plutot que conventionnel, et c'est la seule qui promotionne.
4. **Lire un brouillon** — par identifiant, pour l'inspection et les tests.

Le formulaire, les routes d'envoi et de liberation, et la mutation du **Catalogue** ne parlent qu'a cette interface. Aucun d'eux ne connait une cle R2, un namespace, une duree de pre-signature, ni un etat du registre.

La retention est une **configuration** : une variable d'environnement unique, lue en un seul endroit, avec 24 heures comme valeur initiale. La regle de cycle de vie R2 doit porter la meme valeur, et une verification automatisee doit prouver qu'elle ne peut pas matcher une cle d'image persistee.

## Amendement : la couture transactionnelle, une operation et non un etat

La forme ci-dessus dit « une couture par stockage et une par horloge », et dit qu'aucun appelant ne connait « un etat du registre ». Le second point reste vrai ; le premier a une exception, et il faut la nommer plutot que la contourner.

« La revendication d'un brouillon et la persistance du **Produit** forment une seule operation logique commitee » ne peut pas etre une simple convention temporelle : si la liaison du brouillon au **Produit** s'ecrivait apres la transaction du **Catalogue**, un commit reussi suivi d'une liaison echouee laisserait un **Produit** enregistre dont une **Image produit** n'a ni proprietaire ni fait correspondant — et inversement, l'ecriture inverse laisserait un brouillon revendicable par une tentative qui a echoue. Aucune compensation ne rend cela atomique.

Le module expose donc, en plus des quatre operations, une **liaison dotee de la transaction** : la revendication passe au **Catalogue** une fonction a executer, et le **Catalogue** l'execute dans sa propre transaction en lui passant un port de registre restreint a cette transaction. Concretement :

- le **Catalogue** recoit une **operation** a executer dans son commit, pas un etat du registre a reproduire apres coup ;
- le port passe a cette operation n'expose qu'une confirmation de promotion, il ne donne pas acces au registre ni a l'horloge, et ne survit pas a la transaction ;
- l'interface du cycle de vie, elle, reste a **quatre operations** : cette couture est interne au module et a son composeur, elle n'est pas une operation de plus ;
- la garde de frontiere l'autorise explicitement, et verifie au passage que le **Catalogue** n'atteint toujours pas le port de stockage.

Ce que le **Catalogue** ne recoit pas change : ni cle R2, ni namespace, ni duree de pre-signature, ni etat du registre, ni identifiant de Brouillon en dehors de la liaison qu'il execute. Le vocabulaire de refus, lui, reste entierement compose dans le module proprietaire — y compris sa traduction HTTP, qui est totale et exhaustive pour que l'ajout d'un code soit une erreur de type plutot qu'un 500 silencieux.

## Amendement : une edition abandonnee n'a pas de nettoyage a la demande

L'histoire « annuler une edition pour liberer ses Brouillons non revendiques » (issue #406, histoire 5) n'ajoute aucun mecanisme. Elle est satisfaite par ce qui existe deja : un **Brouillon d'Image produit** abandonne expire seul au bout de la retention, et la regle de cycle de vie R2 sur le prefixe `products/brouillons/` supprime l'objet correspondant. Un nettoyage au moment de la requete est une **optimisation**, pas une source de verite, et l'amendement « La retention » le dit deja.

Aucun gestionnaire de dechargement n'est donc ajoute. Un tel gestionnaire appellerait le reseau pendant une navigation, donc ajouterait un mecanisme d'expiration hors bande de plus — celui-la precisement que l'amendement « L'expiration hors bande » exclut, et dont l'echec serait plus difficile a voir qu'une absence d'objet. Une regle cote fournisseur ne peut ni expirer un objet trop tot, ni disparaitre en silence entre deux deploiement.

Le cout de ce choix est explicite : un **Brouillon d'Image produit** abandonne occupe son prefixe reserve jusqu'a la retention, et pas une seconde de plus. La reclamation est donc au pire d'une retention, ce que la fenetre de reessai du formulaire rend supportable.


