# État du projet — Pointage RH

_Dernière consolidation : 14/11/2026 03:45 (Lead Developer)_

> **Reprise après interruption (mot-clé BADGE)** : lire ce fichier, puis la section « Reste à faire ».
> Environnement de dev : `service postgresql start` ; API prod locale : `cd server && npm run build && cp -r ../client/dist public && NODE_ENV=production JWT_SECRET=… QR_SECRET=… node dist/index.js` ;
> Nginx de test : config de deploy/nginx adaptée dans /tmp/nginx-test.conf (certificats /tmp/certs, à régénérer avec deploy/scripts/generate-certs.sh si absents).

## Synthèse
Backend complet et testé (84 tests). Frontend complet (espace employé mobile, scanner, borne, assistant de configuration, 19 pages admin), testé page par page contre l'API réelle. Version de production compilée et servie derrière Nginx HTTPS. Pointage réel de bout en bout validé dans le navigateur (caméra simulée alimentée par le QR de la borne). Recette QA terminée : aucun P0 ; P1/P2/P3 corrigés (voir ci-dessous).

## Modules

| Module | Backend | Frontend | Tests |
|---|---|---|---|
| A. Authentification, sessions, blocage, RBAC | Terminé | Terminé | Intégration |
| Assistant de configuration + activation | Terminé | Terminé | Intégration (activation via API) |
| B. Employés (CRUD, import/export Excel, badges PDF, QR personnel) | Terminé | Terminé | Intégration (RBAC, désactivation) |
| C. Pointage QR (machine à états, QR dynamiques signés, réseau, idempotence, verrou) | Terminé | Terminé (scanner validé, caméra simulée) | Unitaires + intégration |
| Borne QR de localisation | Terminé | Terminé | Intégration (QR expiré/falsifié/révoqué) |
| D. Horaires versionnés, affectations, jours fériés | Terminé | Terminé | Unitaires + intégration |
| E. Retards / absences / clôture des journées | Terminé | Terminé | Unitaires + intégration |
| F. Heures supplémentaires (potentielles / validées) | Terminé | Terminé | Intégration |
| G. Congés, permissions, justificatifs | Terminé | Terminé | Intégration (workflow complet) |
| H. Tableau de bord (KPI + 6 graphiques) | Terminé | Terminé | Intégration |
| I. Rapports (10) + exports Excel/PDF/CSV | Terminé | Terminé | Intégration |
| J. Notifications internes | Terminé | Terminé | Intégration |
| K. Journal d'audit (immuable) | Terminé | Terminé | Intégration (trigger) |
| L. Paramètres, QR & bornes, utilisateurs, sauvegardes | Terminé | Terminé | Sauvegarde + restauration testées |
| Anomalies (détection + traitement) | Terminé | Terminé | Intégration |
| Déploiement (Docker, Nginx HTTPS, CA locale, scripts) | Écrit | — | HTTPS testé en natif ; images Docker non construites ici (registre bloqué) |

## Bugs connus
- Aucun bug bloquant connu. 85/85 tests.
- Comportement à arbitrer avec le client : après le départ d'un employé de nuit (ex. 23:11), l'écran affiche la journée suivante avec « Pointer mon arrivée » actif ; un pointage le samedi serait accepté et signalé (jour non travaillé, D11).

## Anomalies de la recette QA (14/11) — toutes corrigées
| Gravité | Description | Correction |
|---|---|---|
| P1 | PDF : pied de page générant 2 pages vides, libellés qui se chevauchent | marge basse neutralisée pour le pied, cellules à hauteur fixe, en-têtes sur 2 lignes |
| P2 | Graphique présences : retards comptés deux fois | empilement à l'heure / en retard (front) |
| P2 | Graphique HS par département vide (écart de contrat) | front aligné, API.md corrigé |
| P2 | Décision RH possible avant l'avis du responsable | 409 MANAGER_REVIEW_PENDING si un responsable existe (+ test) |
| P2 | Absences comptées avant la création d'une fiche sans date d'embauche | clôture et tableau de présence partent de la création de la fiche (+ test) |
| P3 | « Départ enregistrée », « 90.9 % », date ISO dans les notifications, heure en double sur l'écran de refus, cartes du tableau de bord à 390 px | corrigés |

## Décisions importantes
Voir docs/DECISIONS.md (notamment D1 Drizzle au lieu de Prisma, D5 QR dynamiques, D11 pointage en jour non travaillé accepté et signalé, D14 aucun taux de majoration inventé).

## Commandes
```bash
# dev
cd server && npm run seed && npm run dev      # API :4000 (démo)
cd client && npm run dev                      # UI :5173
# tests
cd server && npm test
# production
docker compose --profile outils run --rm certs && docker compose up -d --build
```

## Derniers tests exécutés
- Redémarrage du serveur de production : 511 journées / 684 événements identiques avant et après, sessions conservées.
- Recette QA navigateur : borne (rotation 30 s), scan réel, perte réseau pendant un scan, login, mot de passe forcé, RBAC (UI + appels API directs 403), tableau de bord, exports xlsx/pdf/csv, workflow congés, 13 pages à 390 px sans débordement.
- Recette navigateur (prod, HTTPS) : connexion par formulaire, scan ARRIVÉE puis double arrivée refusée, scan DÉPART puis double départ refusé (employé de nuit, 13/11 23:10–23:11).
- Production : refus de démarrer avec les secrets par défaut ; route SPA corrigée (Express 5).
- `server: npm test` → 84/84 (36 unitaires, 48 intégration).
- Sauvegarde `pg_dump` + restauration dans une base vierge : données et triggers identiques.
- Nginx + certificat généré par `generate-certs.sh` : TLS vérifié via la CA, HTTP/2, cookie `Secure`, `X-Forwarded-For` usurpé ignoré.

## Reste à faire
- Construction des images Docker et recette sur le PC du client.
- Recette sur de vrais téléphones Android et iPhone (caméra, borne, certificat) — impossible depuis l'environnement de développement.
