# Pointage RH

Application de gestion du personnel et de pointage par QR Code, hébergée sur un serveur local de l'entreprise (sans dépendance au cloud), utilisable depuis les téléphones Android et iPhone des employés connectés au Wi-Fi de l'établissement.

- **Pointage sécurisé** : QR de localisation dynamiques signés (borne d'entrée/sortie), contrôle du réseau, heure serveur, machine à états, anti-doublon transactionnel, idempotence, journal immuable.
- **Gestion RH** : employés, départements, horaires versionnés avec date d'effet, retards, absences, congés et permissions (workflow responsable → RH), justificatifs, heures supplémentaires à valider, anomalies, corrections tracées.
- **Pilotage** : tableau de bord temps réel, graphiques, 10 rapports exportables (Excel, PDF, CSV), notifications, journal d'audit, sauvegardes automatiques.
- **Quatre rôles** : super administrateur, administrateur RH, responsable de département, employé.

## Démarrage rapide (démonstration)

Prérequis : Node.js 22, PostgreSQL 16.
```bash
# base de données
createuser -P pointage   # mot de passe : pointage
createdb -O pointage pointage
# API (port 4000) avec données FICTIVES de démonstration
cd server && npm install && npm run seed && npm run dev
# Interface (port 5173)
cd client && npm install && npm run dev
```

Comptes de démonstration (mot de passe `Demo2026!`, données fictives) :

| Rôle | Identifiant |
|---|---|
| Super administrateur | `admin` (mot de passe `Admin2026!`) ou `aya.kouassi@demo.local` |
| Administrateur RH | `mariam.bamba@demo.local` |
| Responsable Commercial | `koffi.yao@demo.local` |
| Responsable Logistique | `seydou.kone@demo.local` |
| Employés | `DEMO-004` (Ibrahim Traoré), `brice.kacou@demo.local`, `moussa.diabate@demo.local` (pauses pointées) |

## Production (serveur local)

```bash
cp .env.example .env    # renseigner les secrets, l'IP fixe…
docker compose --profile outils run --rm certs   # certificat HTTPS local
docker compose up -d --build
```
Procédure complète : [docs/INSTALLATION.md](docs/INSTALLATION.md).

## Tests

```bash
cd server
createdb -O pointage pointage_test
npm test        # 36 tests unitaires (calculs, machine à états, QR) + 48 tests d'intégration (API + PostgreSQL)
```

## Documentation

| Document | Contenu |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | architecture, modèle de données, flux de pointage, calculs |
| [API.md](docs/API.md) | contrat de l'API REST |
| [DECISIONS.md](docs/DECISIONS.md) | décisions techniques et métier |
| [SECURITE.md](docs/SECURITE.md) | mesures de sécurité, **limites**, protection des données (ARTCI) |
| [INSTALLATION.md](docs/INSTALLATION.md) | installation, certificats, téléphones, secours, sauvegardes, maintenance |
| [USER_GUIDE.md](docs/USER_GUIDE.md) | guide par rôle |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | état du projet |
