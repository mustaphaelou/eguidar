/**
 * La mesure unique de la boutique : 980 px de boîte, `px-6` de gouttière dès
 * `sm`. Le Bandeau, l'Aperçu du Panier, les pages et le Pied de page lisent
 * tous ce module, donc leurs bords tombent sur la même colonne.
 *
 * Le Bandeau portait `max-w-[1024px]` et `sm:px-[22px]`, le Pied de page
 * `max-w-[980px]` : à partir de 980 px de fenêtre, la boîte du Bandeau
 * débordait de 44 px, soit **22 px de décalage de chaque côté** — le logo
 * du Pied de page ne tombait pas sous celui du Bandeau. Une largeur écrite
 * deux fois dérive ; elle est écrite ici une seule fois.
 *
 * `sm:px-6` et non `sm:px-[22px]` : les pages déclarent déjà cette gouttière,
 * et 22 px n'a aucun sens en `border-box` — Apple obtient ses 22 px sur une
 * boîte `content-box`, donc son `max-width:980px` désigne 980 px de
 * *contenu*, pas la boîte entière.
 */
export const CONTENEUR_BOUTIQUE = "mx-auto w-full max-w-[980px] px-4 sm:px-6"
