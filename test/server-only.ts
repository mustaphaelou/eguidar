/**
 * `server-only` sous vitest.
 *
 * Le paquet `server-only` lève à l'import : c'est un marqueur de bundler, et
 * c'est Next qui l'applique au bundle client. Sous vitest (environnement
 * node), il empêcherait toute suite de charger un module serveur pour de
 * vrai — la suite de la Session courante stube la couche d'authentification
 * *sous* le module, et les suites de l'Administration chargent sa vraie
 * règle de rôle à travers le mock de la lecture. L'alias de
 * `vitest.config.ts` remplace donc le marqueur par ce module vide ; ce qui
 * garde la frontière, c'est
 * `lib/use-cases/session-courante-frontiere.test.ts`, qui lit la source.
 */
export {}
