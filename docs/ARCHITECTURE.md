# Architecture — Pointage RH

## Vue d'ensemble

Monolithe modulaire hébergé sur un ordinateur de l'entreprise transformé en serveur local, accessible en HTTPS depuis les téléphones et ordinateurs connectés au réseau de l'établissement. Aucune dépendance au cloud pour le fonctionnement quotidien.

```
 Téléphones / PC (navigateur, réseau Wi-Fi de l'entreprise)
            │  HTTPS (certificat signé par l'autorité locale)
            ▼
 ┌──────────────────────── Serveur local (Docker Compose) ────────────────────────┐
 │  web  : Nginx — TLS, redirection HTTP→HTTPS, téléchargement du certificat CA,   │
 │         en-têtes de sécurité, limitation de débit, X-Forwarded-For non usurpable│
 │  app  : Node.js / Express / TypeScript — API REST + frontend React compilé      │
 │         tâches planifiées : clôture des journées /10 min, sauvegarde quotidienne│
 │  db   : PostgreSQL 16 (volume persistant, aucun port exposé)                    │
 └─────────────────────────────────────────────────────────────────────────────────┘
 Écran/tablette « borne » à l'entrée : affiche le QR de localisation dynamique (/borne/:code)
```

## Pile technique

| Couche | Choix |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, composants style shadcn/ui (Radix), React Router, TanStack Query, React Hook Form + Zod, Recharts, Lucide, html5-qrcode, police Inter embarquée (aucune ressource externe) |
| Backend | Node.js 22, Express, TypeScript, Drizzle ORM (voir DECISIONS.md), Zod, bcrypt (bcryptjs, coût 12), JWT en cookie HttpOnly adossé à une table de sessions révocables |
| Données | PostgreSQL 16, migrations SQL versionnées (`server/drizzle/`) appliquées au démarrage |
| Exports | ExcelJS, PDFKit, CSV (séparateur `;` + BOM pour Excel FR) |
| Déploiement | Docker Compose, Nginx, HTTPS par autorité de certification locale |

## Organisation du code

```
server/src
  config/env.ts          variables d'environnement validées (refus de démarrer en prod avec les secrets par défaut)
  db/schema.ts           schéma relationnel complet (source de vérité)
  db/sql/                SQL spécifique (triggers d'immuabilité)
  db/bootstrap.ts        initialisation minimale au premier démarrage
  db/seed.ts             base de démonstration (données fictives identifiées)
  middlewares/auth.ts    sessions, RBAC, périmètre département, permissions
  services/
    calc.ts              moteur de calcul RH — fonctions PURES, testées
    stateMachine.ts      machine à états du pointage — PURE, testée
    qr.ts                QR signés HMAC (dynamiques/statiques) — PUR, testé
    schedule.ts          résolution de l'horaire applicable (priorités, versions datées)
    attendance.ts        journées : verrou, recalcul, qualification, anomalies, clôture
    clock.ts             orchestration d'un pointage (tous les contrôles)
    dayContext.ts        jours fériés, congés approuvés
    settings / audit / notify / files / dto
  modules/               routes REST par domaine (auth, setup, employees, schedules, clock,
                         locations+kiosk, attendance, anomalies, leaves, admin, dashboard, reports…)
  jobs/                  clôture des journées, sauvegarde planifiée
server/tests             tests unitaires (calc, machine à états, QR) + intégration (API + PostgreSQL)
client/src
  components/ui          design system
  components/layout      layouts admin (sidebar) et employé (navigation basse)
  features/<domaine>     hooks API (TanStack Query) et composants métier
  pages/<zone>           une page par fichier (admin, app, kiosk)
```

## Modèle de données (principales tables)

- **companies**, **system_settings** (paramètres JSON typés), **departments**, **positions**
- **roles**, **permissions**, **role_permissions** (référentiel RBAC), **users** (identifiant unique insensible à la casse), **sessions** (révocables, expiration)
- **employees** (matricule et email uniques), **employee_qr_codes** (jeton aléatoire 256 bits, un seul actif par employé)
- **schedules** (modèle) → **schedule_versions** (règles datées, jamais modifiées une fois utilisées) ; **schedule_assignments** (employé OU département, période d'effet) ; **holidays**
- **location_qr_codes** (ENTRÉE / SORTIE / MIXTE, mode dynamique/statique, version de secret, clé de borne)
- **attendances** : une ligne par employé et par journée (**contrainte d'unicité** employé + date), version d'horaire figée, état, qualification, indicateurs calculés, qualification imposée par les RH
- **attendance_events** : journal **immuable** de chaque tentative (acceptée ou refusée, motif, IP, appareil, session, heure serveur, heure client informative) ; index uniques partiels « une seule arrivée / un seul départ actifs par journée » ; clé d'idempotence unique par employé
- **attendance_breaks**, **attendance_corrections** (ancienne valeur, nouvelle valeur, motif, administrateur, date — immuable)
- **anomalies** (type, gravité, statut de traitement, déduplication des anomalies ouvertes)
- **leave_types**, **leave_requests** (workflow complet), **justifications** (fichiers stockés hors web), **overtime_records**
- **notifications**, **audit_logs** (immuable), **backups**

Règles de suppression : les tables d'historique (`attendance_events`, `attendance_corrections`, `audit_logs`) sont protégées par **triggers PostgreSQL** qui refusent toute suppression ou modification, y compris par l'application. Les employés ne sont jamais supprimés mais désactivés (`ON DELETE RESTRICT` sur les présences).

## Flux d'un pointage (`POST /api/clock/scan`)

1. Limitation des tentatives par employé (paramétrable) + limitation Nginx.
2. **Idempotence** : un scan rejoué (double clic, renvoi réseau) avec la même clé renvoie le résultat initial.
3. Pointage activé par l'administrateur (assistant de configuration terminé) ?
4. Employé actif ? (un employé désactivé perd aussi ses sessions).
5. **Réseau autorisé** : IP du client dans les CIDR configurés (IP transmise par Nginx, non usurpable).
6. **QR** : signature HMAC valide, non expiré (fenêtre courante ou précédente), bon établissement, emplacement actif, version de secret courante, type compatible (ENTRÉE pour arrivée / fin de pause, SORTIE pour départ / début de pause).
7. Résolution de la **journée de travail** (gère les horaires de nuit traversant minuit) et de la version d'horaire applicable.
8. **Transaction** : création/verrouillage de la journée (`SELECT … FOR UPDATE`) → **machine à états** → enregistrement avec l'**heure du serveur** → recalcul → anomalies au fil de l'eau → notifications.
9. En cas de refus : événement `REFUSE` journalisé avec motif ; détection des doubles pointages, départs sans arrivée, scans hors réseau, QR falsifiés et tentatives répétées.

Les doublons sont donc empêchés à quatre niveaux : machine à états, verrou de ligne, index uniques partiels en base, idempotence.

## Machine à états

```
NON_POINTE ─ARRIVEE→ PRESENT ─DEPART→ PARTI
                       │PAUSE_DEBUT (si pauses pointées)
                       ▼
                   EN_PAUSE ─PAUSE_FIN→ DE_RETOUR_DE_PAUSE ─DEPART→ PARTI
                                          └─PAUSE_DEBUT (si pauses restantes)→ EN_PAUSE
POINTAGE_INCOMPLET / ANOMALIE : journée clôturée, modifiable uniquement par correction administrative
```
Paramétrage par horaire : pauses pointées oui/non, nombre maximal de pauses. Toute autre transition est refusée avec un code et un message explicites (DOUBLE_ARRIVEE, DOUBLE_DEPART, DEPART_SANS_ARRIVEE, ARRIVEE_APRES_DEPART, PAUSE_EN_COURS, MAX_PAUSES_ATTEINT…).

## Moteur de calcul (services/calc.ts)

- Retard brut = arrivée − début théorique ; retard retenu = brut − tolérance s'il dépasse la tolérance (08 h 25, tolérance 10 → 15 min).
- Présence = départ − arrivée. Pause = pauses réellement pointées, ou à défaut chevauchement avec la pause planifiée. Travail effectif = présence − pause.
- Heures normales = min(effectif, théorique) ; HS potentielles = effectif − théorique si l'excédent dépasse le seuil ; jamais validées automatiquement si la politique l'exige.
- Départ anticipé, jours non travaillés, fériés, congés (théorique = 0), horaires de nuit, fuseau de l'entreprise.
- Chaque journée garde la version d'horaire en vigueur à sa date : une modification d'horaire ne recalcule jamais le passé.

## Clôture des journées (toutes les 10 minutes)

Une journée est clôturée quand sa fin théorique + marge (paramétrable, 2 h par défaut) est passée : création des journées sans pointage, qualification (absence non justifiée **seulement après clôture**, et jamais si congé, permission, mission, férié, jour non travaillé ou justificatif validé), détection des départs manquants, pauses non terminées, durées anormales ; notifications aux employés concernés.

## Sécurité

Voir [SECURITE.md](SECURITE.md).
