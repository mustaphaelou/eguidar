/**
 * Le plancher de longueur d'un mot de passe, partagé par la configuration de
 * Better Auth et par les schémas de formulaire client. La valeur est 15 parce
 * que le mot de passe est aujourd'hui le seul facteur : NIST SP 800-63B-4
 * §3.1.1.2 l'exige pour un facteur unique, et ASVS 6.2.1 le recommande
 * fortement. Un seul export, pour que le serveur et le client ne puissent pas
 * diverger.
 */
export const LONGUEUR_MINIMALE_MOT_DE_PASSE = 15
