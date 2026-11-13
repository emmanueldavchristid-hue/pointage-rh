# Sécurité, limites et conformité

## Mesures en place

**Authentification et sessions**
- Mots de passe hachés avec bcrypt (coût 12) ; règle minimale : 8 caractères, au moins une lettre et un chiffre.
- Changement de mot de passe obligatoire à la première connexion et après réinitialisation administrative.
- Blocage temporaire après N échecs (5 par défaut, 15 min) ; limitation de débit sur la connexion.
- Cookie de session `HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS ; aucune donnée d'authentification dans localStorage.
- Sessions côté serveur, expirées (12 h par défaut) et révoquées à la déconnexion, au changement de mot de passe, à la désactivation du compte ou au changement de rôle.

**Autorisations (RBAC)**
- Quatre rôles (super administrateur, administrateur RH, responsable de département, employé), vérifiés sur **chaque** endpoint côté serveur.
- Le responsable est restreint à son département par filtrage serveur ; l'employé n'accède qu'à ses propres données.
- Un administrateur RH ne peut ni modifier les paramètres techniques, ni créer d'administrateur, ni toucher à un super administrateur. Il doit toujours rester un super administrateur actif.
- Personne ne valide ses propres congés ou heures supplémentaires.

**Pointage**
- Heure de référence = heure du serveur (l'heure envoyée par le téléphone est conservée à titre informatif uniquement).
- QR de localisation signés (HMAC-SHA256, secret serveur), dynamiques (renouvelés toutes les 30 s), refus des codes expirés, falsifiés, révoqués, d'un autre établissement ou du mauvais type.
- Contrôle du réseau autorisé (plages CIDR) ; Nginx transmet l'IP réelle sans possibilité d'usurpation par l'en-tête `X-Forwarded-For`.
- Anti-doublon à quatre niveaux (machine à états, verrou transactionnel, index uniques partiels en base, idempotence).
- Limitation des tentatives par employé ; anomalies automatiques sur tentatives répétées, scans hors réseau, QR invalides.

**Intégrité et traçabilité**
- Journal d'audit (connexions, échecs, créations, modifications, désactivations, corrections, validations, changements d'horaires et de paramètres, exports) **non modifiable** : un trigger PostgreSQL refuse toute modification ou suppression.
- Événements de pointage jamais supprimés ; une correction marque l'événement initial « remplacé » et conserve ancienne valeur, nouvelle valeur, motif, administrateur et date (table elle aussi immuable).
- Validation de toutes les entrées côté serveur (Zod) ; requêtes paramétrées (ORM) contre l'injection SQL ; transactions pour les opérations critiques.

**Fichiers**
- Types autorisés limités (PDF, JPG, PNG, WebP), taille limitée, contrôle de la signature binaire (pas seulement du type déclaré), noms de fichiers aléatoires.
- Les justificatifs ne sont jamais servis directement : téléchargement via une route contrôlée (propriétaire, RH ou responsable du périmètre) et tracée.

**Infrastructure**
- La base de données n'expose aucun port ; seuls 80 (redirection + certificat CA) et 443 sont ouverts.
- HTTPS (TLS 1.2/1.3), en-têtes de sécurité, refus de démarrer en production avec les secrets par défaut.
- Sauvegarde automatique quotidienne avec rotation, sauvegarde manuelle, procédure de restauration testée.

## Limites à connaître (à présenter honnêtement au client)

1. **Aucun QR Code ni contrôle d'adresse IP ne prouve à lui seul la présence physique.** Le dispositif rend la fraude difficile et détectable, il ne la rend pas impossible :
   - un employé présent sur le Wi-Fi peut photographier le QR dynamique et l'envoyer à un collègue **également connecté au Wi-Fi** de l'entreprise (par exemple sur le parking) dans les 30 à 60 secondes ;
   - un employé peut confier son téléphone **et** son mot de passe à un collègue ;
   - le Wi-Fi peut parfois être capté depuis l'extérieur immédiat du bâtiment.
2. Atténuations disponibles : QR dynamique (par défaut), restriction des plages réseau au seul sous-réseau du Wi-Fi interne (et non à toutes les plages privées), Wi-Fi protégé par mot de passe non communiqué hors de l'entreprise, borne placée dans un lieu visible (accueil, vidéosurveillance existante), contrôle par les responsables du tableau « présents », journal des appareils (identifiant d'appareil, IP) consultable par les RH, alertes sur tentatives répétées.
3. Évolutions possibles si un niveau de preuve plus élevé est requis : scan du **badge personnel par une borne tenue par l'accueil**, liaison d'un seul appareil par employé, photo au pointage, géorepérage GPS (contournable), lecteur biométrique (soumis à autorisation préalable de l'ARTCI).
4. Le mode **QR statique** (imprimé) est plus faible : une photo reste valable jusqu'à la rotation du secret. À réserver aux cas sans écran possible, avec rotation régulière.
5. Le serveur local est un point unique : en cas de panne, appliquer la procédure de secours (INSTALLATION.md §9).

## Protection des données personnelles (Côte d'Ivoire)

Le logiciel traite des données personnelles de salariés (identité, coordonnées, horaires, absences, justificatifs pouvant contenir des informations de santé). En Côte d'Ivoire, ce traitement relève de la **loi n° 2013-450 du 19 juin 2013** relative à la protection des données à caractère personnel, dont l'autorité de contrôle est l'**ARTCI**.

Points qui nécessitent une **validation humaine ou juridique** (le logiciel ne garantit pas à lui seul la conformité) :
- Accomplir les **formalités préalables auprès de l'ARTCI** (déclaration ou demande d'autorisation selon la nature du traitement ; une autorisation est notamment exigée pour les données biométriques, non utilisées ici).
- **Informer les salariés** (finalité du traitement, destinataires, durée de conservation, droits d'accès, de rectification et d'opposition) et consulter les représentants du personnel le cas échéant ; adapter le règlement intérieur.
- Fixer les **durées de conservation** (paramétrables : journal d'audit, présences) en accord avec le service juridique ; prévoir l'exercice du droit d'accès (rapport individuel exportable).
- Les **justificatifs médicaux** sont des données sensibles : en limiter l'accès aux seuls RH (déjà le cas techniquement) et définir une politique de conservation courte.
- Les **taux de majoration des heures supplémentaires**, la qualification des absences et les règles de retenue relèvent du Code du travail ivoirien et de la convention collective applicable : à paramétrer et valider par les RH / le conseil juridique.
- Sécurité physique du serveur (local fermé, onduleur), chiffrement du disque recommandé, sauvegardes conservées hors du serveur.
