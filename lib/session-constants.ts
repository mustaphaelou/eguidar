export const SESSION_INACTIVE_SECONDS = 30 * 60

export const SESSION_UPDATE_AGE_SECONDS = SESSION_INACTIVE_SECONDS / 5

/**
 * La durée absolue d'une session, mesurée depuis sa création : elle ne glisse
 * pas avec l'activité. L'inactivité et cette borne sont deux fins distinctes ;
 * le nom des constantes porte la distinction. Les plafonds NIST AAL1 (30 jours)
 * et AAL2 (24 heures) donnent les deux valeurs, et l'Administration — un accès
 * plus sensible — prend la plus courte.
 */
export const SESSION_ABSOLUTE_CLIENT_SECONDS = 30 * 24 * 60 * 60

export const SESSION_ABSOLUTE_ADMIN_SECONDS = 24 * 60 * 60
