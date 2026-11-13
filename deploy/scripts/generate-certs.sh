#!/bin/sh
# Crée une autorité de certification locale (CA) puis un certificat serveur signé par elle.
# La CA (ca.crt) est à installer UNE FOIS sur chaque téléphone/PC autorisé : le navigateur fait alors
# confiance au site en HTTPS, condition indispensable à l'accès caméra sur Android et iPhone.
set -e
OUT=${CERT_DIR:-/certs}
IP=${SERVER_IP:?SERVER_IP requis}
NAME=${SERVER_NAME:-pointage.entreprise.lan}
cd "$OUT"
if [ ! -f ca.key ]; then
  openssl genrsa -out ca.key 4096
  openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt \
    -subj "/C=CI/O=Pointage RH (CA locale)/CN=Pointage RH - Autorite locale"
  echo "Autorité locale créée (valable 10 ans)."
fi
cat > server.ext <<EXT
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=@alt
[alt]
DNS.1=$NAME
DNS.2=localhost
IP.1=$IP
IP.2=127.0.0.1
EXT
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr -subj "/C=CI/O=Pointage RH/CN=$NAME"
# 825 jours max : limite imposée par iOS pour les certificats serveur
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 825 -sha256 -extfile server.ext
cat server.crt ca.crt > fullchain.crt
rm -f server.csr server.ext
chmod 600 ca.key server.key
echo "Certificat serveur créé pour $NAME et $IP (valable 825 jours)."
