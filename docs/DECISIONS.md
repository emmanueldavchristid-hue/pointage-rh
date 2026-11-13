# Journal des décisions

| # | Décision | Raison |
|---|---|---|
| D1 | **Drizzle ORM** au lieu de Prisma | Les moteurs binaires de Prisma n'ont pas pu être téléchargés dans l'environnement de développement. Drizzle offre le même rôle (schéma typé, migrations SQL versionnées, requêtes typées) en 100 % JavaScript, sans binaire à télécharger : installation plus simple et plus robuste chez le client. Les migrations sont du SQL lisible et versionné dans `server/drizzle/`. |
| D2 | Monolithe modulaire, frontend servi par le backend | Un seul conteneur applicatif à maintenir ; Nginx ne fait que TLS et proxy. |
| D3 | Sessions serveur + JWT en cookie HttpOnly, SameSite=Strict, Secure | Révocation immédiate (déconnexion, désactivation, changement de mot de passe) ; aucun jeton accessible au JavaScript ni stocké dans localStorage. |
| D4 | bcrypt (bcryptjs, coût 12) | Demandé par le cahier des charges ; implémentation pure JS, aucune compilation native. |
| D5 | QR de localisation **dynamiques** par défaut (rotation 30 s, signature HMAC-SHA256), affichés par une borne | Une photo du QR transmise à un collègue absent expire en moins d'une minute. Le mode statique imprimable reste disponible (révocable par rotation du secret). |
| D6 | Fenêtre de tolérance d'un cran (code courant + précédent) | Évite les refus au moment exact de la rotation. |
| D7 | QR personnel = badge de secours (`PRHB.<jeton>`) scanné par un poste RH | Le pointage normal se fait par le téléphone de l'employé connecté (identité = session) ; le badge sert aux employés sans téléphone ou en cas de panne, sous contrôle RH, tracé dans l'audit. |
| D8 | Une ligne `attendances` par employé et par journée + journal `attendance_events` immuable | Contrainte d'unicité simple et lisible ; l'historique complet (y compris les refus) reste consultable. |
| D9 | Version d'horaire figée sur chaque journée | Exigence : ne jamais recalculer les anciennes présences avec de nouvelles règles. |
| D10 | Absence qualifiée « non justifiée » uniquement à la clôture de la journée | Exigence ; permet aux congés, permissions, justificatifs de prévaloir. |
| D11 | Pointage un jour férié / non travaillé / en congé : **accepté** mais signalé en anomalie | Ne pas bloquer un travail réel (astreinte, urgence) tout en informant les RH. |
| D12 | Arrivée très en avance ou hors plage : acceptée + anomalie `HORS_HORAIRE` | Même logique ; aucune fausse présence n'est créée, l'heure réelle est conservée. |
| D13 | Départ anticipé : minutes retenues au-delà de la tolérance (valeur brute) ; retard : tolérance déduite | Retard conforme à l'exemple du cahier des charges ; départ anticipé exprimé tel que constaté. Paramétrable par horaire (tolérances). |
| D14 | HS : déclenchées quand l'excédent dépasse le seuil, comptées en totalité ; validation RH/responsable obligatoire par défaut ; **aucun taux de majoration pré-rempli** | Les taux dépendent de la convention collective et du droit du travail ivoirien : ils sont paramétrables par l'administrateur. |
| D15 | Congés : si le type exige une validation RH, le responsable donne un avis puis les RH décident ; sinon l'avis du responsable vaut décision | Workflow du cahier des charges (étapes 3 à 5). |
| D16 | Jours fériés fixes pré-chargés (récurrents) ; fêtes mobiles à saisir chaque année | Les dates des fêtes religieuses mobiles (Ramadan, Tabaski, Maouloud…) sont fixées chaque année par décret : pas de date inventée. |
| D17 | Fuseau Africa/Abidjan (UTC+0, sans heure d'été) ; tout est stocké en UTC, les journées en date locale de l'entreprise | Calculs fiables et fuseau modifiable dans les paramètres. |
| D18 | Contrôle réseau par plages CIDR (par défaut : réseaux privés) à **restreindre au sous-réseau réel** à l'installation | Empêche le pointage depuis Internet ; complété par la rotation des QR. Limites documentées dans SECURITE.md. |
| D19 | Certificats : autorité locale (CA) générée sur place, installée une fois sur chaque appareil | Les navigateurs mobiles exigent HTTPS « de confiance » pour la caméra ; pas de dépendance à Internet ni à un domaine public. Alternative documentée : domaine public + certificat Let's Encrypt (DNS-01). |
| D20 | Nom local recommandé en `.lan` (DNS du routeur) plutôt que `.local` ; l'IP fixe est toujours incluse dans le certificat | `.local` repose sur mDNS, mal supporté par certains Android : l'adresse IP fonctionne partout. |
| D21 | Pas de service worker / notifications push dans le MVP | Facultatif selon le cahier des charges ; notifications internes livrées. |
| D22 | Données de démonstration générées par `npm run seed` uniquement (matricules DEMO-xxx, emails @demo.local, `is_demo`) ; l'installation réelle démarre vide | Aucune donnée fictive dans une base de production. |
