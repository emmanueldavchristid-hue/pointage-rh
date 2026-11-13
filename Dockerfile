# ---------- 1. Frontend
FROM node:22-alpine AS web
WORKDIR /web
COPY client/package*.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---------- 2. Backend
FROM node:22-alpine AS api
WORKDIR /api
COPY server/package*.json ./
RUN npm ci --no-audit --no-fund
COPY server/ ./
RUN npm run build && npm prune --omit=dev

# ---------- 3. Image finale
FROM node:22-alpine
# pg_dump 16 pour les sauvegardes (doit être ≥ à la version du serveur PostgreSQL)
RUN apk add --no-cache postgresql16-client tzdata && addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production TZ=Africa/Abidjan PORT=4000 UPLOAD_DIR=/data/uploads BACKUP_DIR=/data/backups
WORKDIR /app
COPY --from=api /api/node_modules ./node_modules
COPY --from=api /api/dist ./dist
COPY --from=api /api/drizzle ./drizzle
COPY --from=api /api/package.json ./
COPY --from=web /web/dist ./public
RUN mkdir -p /data/uploads /data/backups && chown -R app:app /data
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "dist/index.js"]
