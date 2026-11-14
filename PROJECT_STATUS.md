# État du projet — Pointage RH

_Dernière consolidation : 14/11/2026 03:25 (Lead Developer)_

> **Reprise après interruption (mot-clé BADGE)** : lire ce fichier, puis la section « Reste à faire ».
> Environnement de dev : `service postgresql start` ; API prod locale : `cd server && npm run build && cp -r ../client/dist public && NODE_ENV=production JWT_SECRET=… QR_SECRET=… node dist/index.js` ;
> Nginx de test : config de deploy/nginx adaptée dans /tmp/nginx-test.conf (certificats /tmp/certs, à régénérer avec deploy/scripts/generate-certs.sh si absents).

## Synthèse
Backend complet et testé (84 tests). Frontend complet (espace employé mobile, scanner, borne, assistant de configuration, 19 pages admin), testé page par page contre l'API réelle. Version de production compilée et servie derrière Nginx HTTPS. Pointage réel de bout en bout validé dans le navigateur (caméra simulée alimentée par le QR de la borne). Recette QA en cours.

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
- Aucun bug backend connu (84/84 tests).

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
- Recette navigateur (prod, HTTPS) : connexion par formulaire, scan ARRIVÉE puis double arrivée refusée, scan DÉPART puis double départ refusé (employé de nuit, 13/11 23:10–23:11).
- Production : refus de démarrer avec les secrets par défaut ; route SPA corrigée (Express 5).
- `server: npm test` → 84/84 (36 unitaires, 48 intégration).
- Sauvegarde `pg_dump` + restauration dans une base vierge : données et triggers identiques.
- Nginx + certificat généré par `generate-certs.sh` : TLS vérifié via la CA, HTTP/2, cookie `Secure`, `X-Forwarded-For` usurpé ignoré.

## Reste à faire
- Fin de la recette QA (agent) et correction des anomalies remontées.
- Test de redémarrage du serveur sans perte de données (prod locale).
- Construction des images Docker et recette sur le PC du client.
- Recette sur de vrais téléphones Android et iPhone (caméra, borne, certificat) — impossible depuis l'environnement de développement.
