# État du projet — Pointage RH

_Dernière consolidation : 13/11/2026 (Lead Developer)_

## Synthèse
Backend complet et testé (84 tests). Frontend en cours d'intégration par trois agents (espace employé + borne + assistant ; admin pilotage ; admin temps/rapports/administration). Déploiement Docker écrit ; chaîne HTTPS Nginx + certificats testée en natif.

## Modules

| Module | Backend | Frontend | Tests |
|---|---|---|---|
| A. Authentification, sessions, blocage, RBAC | Terminé | Terminé (socle) | Intégration |
| Assistant de configuration + activation | Terminé | En cours | Intégration (activation via API) |
| B. Employés (CRUD, import/export Excel, badges PDF, QR personnel) | Terminé | En cours | Intégration (RBAC, désactivation) |
| C. Pointage QR (machine à états, QR dynamiques signés, réseau, idempotence, verrou) | Terminé | En cours (scanner) | Unitaires + intégration |
| Borne QR de localisation | Terminé | En cours | Intégration (QR expiré/falsifié/révoqué) |
| D. Horaires versionnés, affectations, jours fériés | Terminé | En cours | Unitaires + intégration |
| E. Retards / absences / clôture des journées | Terminé | En cours | Unitaires + intégration |
| F. Heures supplémentaires (potentielles / validées) | Terminé | En cours | Intégration |
| G. Congés, permissions, justificatifs | Terminé | En cours | Intégration (workflow complet) |
| H. Tableau de bord (KPI + 6 graphiques) | Terminé | En cours | Intégration |
| I. Rapports (10) + exports Excel/PDF/CSV | Terminé | En cours | Intégration |
| J. Notifications internes | Terminé | Socle + en cours | Intégration |
| K. Journal d'audit (immuable) | Terminé | En cours | Intégration (trigger) |
| L. Paramètres, QR & bornes, utilisateurs, sauvegardes | Terminé | En cours | Sauvegarde + restauration testées |
| Anomalies (détection + traitement) | Terminé | En cours | Intégration |
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
- `server: npm test` → 84/84 (36 unitaires, 48 intégration).
- Sauvegarde `pg_dump` + restauration dans une base vierge : données et triggers identiques.
- Nginx + certificat généré par `generate-certs.sh` : TLS vérifié via la CA, HTTP/2, cookie `Secure`, `X-Forwarded-For` usurpé ignoré.

## Reste à faire
- Intégration et recette du frontend (en cours).
- Construction des images Docker et recette sur le PC du client.
- Recette sur de vrais téléphones Android et iPhone (caméra, borne, certificat) — impossible depuis l'environnement de développement.
