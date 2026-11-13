# Installation chez le client

Durée indicative : 1 h 30 (hors préparation du matériel). Une connexion Internet est nécessaire **uniquement pendant l'installation** (téléchargement de Docker et des images) ; ensuite tout fonctionne sur le réseau local.

## 1. Matériel et réseau

- Un PC dédié qui restera allumé 24 h/24 : 4 Go de RAM minimum (8 Go conseillés), 50 Go libres, Windows 10/11 Pro, Ubuntu 22.04/24.04 ou équivalent. **Onduleur fortement recommandé.**
- Le PC est relié au routeur **en câble Ethernet** (plus stable que le Wi-Fi).
- Une tablette ou un écran (avec un petit PC ou une clé HDMI) à l'entrée pour la **borne QR** — ou, à défaut, impression d'un QR statique.
- **Adresse IP fixe** : dans l'interface de la box/routeur, créer une **réservation DHCP** pour l'adresse MAC du PC (ex. `192.168.1.50`). Noter aussi le sous-réseau du Wi-Fi des employés (ex. `192.168.1.0/24`).
- Optionnel : dans le DNS du routeur, associer un nom (ex. `pointage.entreprise.lan`) à cette IP. Éviter `.local` (mal résolu par certains Android).

## 2. Paramètres d'alimentation du PC

- Windows : Paramètres → Système → Alimentation → mise en veille **Jamais** ; désactiver la mise en veille prolongée ; dans le BIOS, activer « Restore on AC power loss / Power On ».
- Mises à jour Windows : définir des heures d'activité de nuit et planifier les redémarrages hors horaires de travail.

## 3. Installer Docker

- **Windows** : installer Docker Desktop (WSL 2). Dans Docker Desktop → Settings → General : cocher « Start Docker Desktop when you sign in » ; configurer l'ouverture de session automatique de l'utilisateur dédié (ou utiliser Docker Engine dans WSL avec démarrage automatique).
- **Ubuntu** : `curl -fsSL https://get.docker.com | sh` puis `sudo systemctl enable docker`.

## 4. Récupérer l'application

```bash
git clone https://github.com/emmanueldavchristid-hue/pointage-rh.git
cd pointage-rh
cp .env.example .env
```
Éditer `.env` : générer trois secrets longs (`openssl rand -base64 48` ou un gestionnaire de mots de passe) pour `DB_PASSWORD`, `JWT_SECRET`, `QR_SECRET` ; renseigner `SERVER_IP`, `SERVER_NAME`, `PUBLIC_URL`, `ADMIN_INITIAL_PASSWORD`, et `BACKUP_HOST_DIR` (idéalement un second disque, ex. `D:/sauvegardes-pointage`). **Conserver une copie de `.env` en lieu sûr** (sans elle, les QR et sessions sont invalidés et la base est inaccessible).

## 5. Certificat HTTPS (indispensable pour la caméra sur téléphone)

```bash
docker compose --profile outils run --rm certs
```
Cela crée dans `deploy/certs/` une **autorité locale** (`ca.crt`, valable 10 ans) et le certificat du serveur (825 jours, limite iOS) pour l'IP et le nom configurés. Sauvegarder `deploy/certs/ca.key` hors du serveur (nécessaire au renouvellement). Pour renouveler le certificat serveur : relancer la même commande (l'autorité existante est réutilisée, les téléphones n'ont rien à refaire).

## 6. Démarrer

```bash
docker compose up -d --build
docker compose ps          # db, app et web doivent être « healthy / running »
```
Les services redémarrent automatiquement (`restart: unless-stopped`) après une coupure ou un redémarrage du PC.

Pare-feu Windows : autoriser les connexions entrantes TCP 80 et 443 sur le profil « Privé » uniquement.

## 7. Première configuration (super administrateur)

1. Sur le PC : ouvrir `https://<IP>` (accepter l'avertissement la première fois ou installer `ca.crt`, voir §8).
2. Se connecter avec `ADMIN_LOGIN` / `ADMIN_INITIAL_PASSWORD`, puis choisir un nouveau mot de passe.
3. L'**assistant de configuration** s'ouvre : établissement et logo, horaire de travail par défaut, QR d'entrée et de sortie, réseau autorisé (**saisir le sous-réseau réel du Wi-Fi interne**, ex. `192.168.1.0/24`, et retirer les autres plages), puis **Activer le pointage**.
4. Créer les départements, les horaires particuliers, ajouter les **jours fériés mobiles de l'année**, importer les employés (modèle Excel fourni) et noter les mots de passe initiaux.
5. Ouvrir sur la tablette d'entrée le lien de borne affiché dans « QR Codes & bornes » (plein écran, mise en veille désactivée).

## 8. Préparer les téléphones (une seule fois par appareil)

Sur le téléphone connecté au Wi-Fi de l'entreprise, ouvrir `http://<IP>/installer` puis suivre les instructions :
- **Android** : télécharger le certificat → Paramètres → Sécurité → Chiffrement et identifiants → Installer un certificat → **Certificat CA**.
- **iPhone** : ouvrir le lien dans **Safari** → autoriser le profil → Réglages → Général → VPN et gestion de l'appareil → Installer ; puis Réglages → Général → Informations → Réglages des certificats → **activer la confiance totale**.

Ensuite ouvrir `https://<IP>` (ou le nom local), se connecter et **« Ajouter à l'écran d'accueil »** pour un accès en un geste. Au premier scan, autoriser l'accès à la caméra.

> À valider sur place avec au moins un Android et un iPhone : connexion, scan d'arrivée sur la borne, scan de départ, refus d'un second scan.

## 9. Procédure de secours (panne du serveur ou du réseau)

1. Un **registre papier** daté est tenu à l'accueil (nom, heure d'arrivée, heure de départ, signature).
2. Au retour du service, les RH saisissent chaque ligne via **Pointages → Ajouter un pointage exceptionnel** avec le motif « Panne du [date] — registre papier ». Chaque saisie est tracée (auteur, date, motif).
3. Pour un employé sans téléphone ponctuellement : pointage par **badge personnel** scanné depuis un poste RH (source « badge », tracée).

## 10. Sauvegardes et restauration

- **Automatique** : chaque jour à 23 h 30 (paramétrable), rotation des 30 dernières, dans `BACKUP_HOST_DIR`. Recopier régulièrement ce dossier **hors du serveur** (disque externe, autre PC).
- **Manuelle** : bouton « Sauvegarder maintenant » (Administration → Sauvegardes) ou `./deploy/scripts/backup.sh`.
- **Restauration** : `./deploy/scripts/restore.sh deploy/backups/<fichier>.dump` (une sauvegarde de sécurité est faite automatiquement avant ; confirmation « OUI » demandée). Procédure testée : les données et les protections d'immuabilité sont restaurées à l'identique.

## 11. Maintenance

| Tâche | Commande / action |
|---|---|
| État des services | `docker compose ps` |
| Journaux | `docker compose logs -f app` |
| Mise à jour | `git pull && docker compose up -d --build` (les migrations s'appliquent automatiquement) |
| Redémarrer | `docker compose restart` |
| Vérifier la santé | `https://<IP>/api/health` |
| Renouveler le certificat (tous les ~2 ans) | `docker compose --profile outils run --rm certs && docker compose restart web` |

## 12. Mode démonstration (avant-vente)

Sur un poste de développement (Node 22 + PostgreSQL 16) :
```bash
cd server && npm install && npm run seed && npm run dev     # API sur :4000, données fictives
cd client && npm install && npm run dev                      # interface sur :5173
```
Comptes de démonstration : voir README.md. Ne jamais exécuter `npm run seed` sur la base de production.
