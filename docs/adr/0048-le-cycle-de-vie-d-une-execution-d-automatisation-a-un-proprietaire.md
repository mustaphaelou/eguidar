# Le cycle de vie d'une Exécution d'automatisation a un propriétaire

Un seul module, `lib/automations/executions.ts`, possède l'ouverture, la clôture,
l'annulation et l'ouverture de réessai d'une Exécution d'automatisation. Le
numéro de tentative est la propriété de ce module : il reprend la ligne `en_cours`
du couple (Événement, Règle) si elle existe, sinon crée `max(attempt) + 1`. Le
compteur `attempts` de l'Événement reste le compteur de retries qui pilote le
backoff et la mise en file morte ; il n'est plus l'identité de l'Exécution.

Conséquences :
- un redrive ne réécrit plus les lignes historiques ;
- un réessai manuel refuse un Événement dont la fenêtre de rejeu est fermée ;
- la durée est dérivée une seule fois, dans `terminerExecution` ;
- `IssueExecution` est le type fermé accepté par une écriture terminale.
