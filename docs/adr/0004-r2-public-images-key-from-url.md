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
| Suppression | avant commit, explicite, signalee a l'editeur | apres commit, en best-effort |

### Le registre durable

Un **Brouillon d'Image produit** est un enregistrement durable, et non un objet nu dans le bucket. Chaque enregistrement porte : un **identifiant opaque** (UUID, cle de la table, sans lien derivable avec l'URL), l'**identite de stockage** (cle d'objet, derivee de cet identifiant et non du contraire), le **proprietaire** (l'editeur d'Administration, ou la tentative d'edition), la **date de creation**, la **date d'expiration**, et l'**etat de cycle de vie**. Le registre est donc consultable : le support peut expliquer pourquoi un objet est present ou absent, sans passer par R2.

### La retention

La retention d'un brouillon abandonne est de **24 heures**, configuree, et non un fait cache dans un formulaire ou une route. Elle est deliberement plus longue que la duree de vie de cinq minutes d'une URL d'envoi pre-signee : c'est ce qui permet de reessayer un enregistrement echoue sans téléverser l'image a nouveau. Un nettoyage au moment de la requete reste une optimisation possible ; il n'est pas la source de verite.

### L'expiration hors bande

Aucun file, aucun worker, aucun planificateur generique. Une **regle de cycle de vie Cloudflare R2** cible le seul prefixe `products/brouillons/`. Les Images produit persistees vivent sous `products/` et ne peuvent donc pas matcher la regle : la cle d'un objet persistant est `products/<uuid><ext>`, et un UUID ne contient pas de separateur, donc aucune cle persistante ne peut commencer par `products/brouillons/`. Une regle de cycle de vie « globale » sur le bucket est explicitement exclue.

### La promotion, et son idempotence

Un brouillon n'est jamais enregistre tel quel. La **promotion** copie l'objet de `products/brouillons/<id><ext>` vers `products/<id><ext>`, l'identifiant etant conserve. La cle persistante est donc une **fonction pure de l'identifiant du brouillon**, et la promotion est **idempotente** : un nouvel essai resout vers le meme fait persistant, il ne cree jamais une seconde identite publique. Le **Produit** enregistre les URL publiques permanentes issues de la promotion, jamais l'URL du brouillon.

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

