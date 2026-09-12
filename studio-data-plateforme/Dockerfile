# Image de la plateforme Studio Data : API NestJS + front Angular + application classique, en une seule image.
# Construction en deux étapes : la première compile tout (elle a besoin des sources de studio-data et de
# studio-data-serveur, d'où le contexte de construction à la racine du dépôt) ; la seconde ne garde que
# l'exécutable et les fichiers construits.
#   docker build -f studio-data-plateforme/Dockerfile -t studio-data .

FROM node:22-bookworm-slim AS construction
WORKDIR /construction
# Sources nécessaires : la plateforme, l'application mono-fichier (front classique) et son constructeur serveur.
COPY studio-data/src ./studio-data/src
COPY studio-data/tools ./studio-data/tools
COPY studio-data-serveur/package.json studio-data-serveur/package-lock.json ./studio-data-serveur/
COPY studio-data-serveur/client ./studio-data-serveur/client
COPY studio-data-plateforme ./studio-data-plateforme
RUN cd studio-data-serveur && npm ci --no-audit --no-fund --ignore-scripts
RUN cd studio-data-plateforme/api && npm ci --no-audit --no-fund && npm run construire
RUN cd studio-data-plateforme/web && npm ci --no-audit --no-fund && npm run construire
RUN cd studio-data-plateforme && node web-classique/construire.mjs
RUN cd studio-data-plateforme/api && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    SD_HOTE=0.0.0.0 \
    SD_PORT=8430 \
    SD_DONNEES=/donnees \
    SD_WEB=/application/web \
    SD_WEB_CLASSIQUE=/application/web-classique
WORKDIR /application
COPY --from=construction /construction/studio-data-plateforme/api/package.json ./api/package.json
COPY --from=construction /construction/studio-data-plateforme/api/node_modules ./api/node_modules
COPY --from=construction /construction/studio-data-plateforme/api/dist ./api/dist
COPY --from=construction /construction/studio-data-plateforme/api/migrations ./api/migrations
COPY --from=construction /construction/studio-data-plateforme/web/dist/studio-data/browser ./web
COPY --from=construction /construction/studio-data-plateforme/web-classique/dist ./web-classique
RUN mkdir -p /donnees && chown -R node:node /donnees /application
USER node
VOLUME ["/donnees"]
EXPOSE 8430
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8430/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "api/dist/src/main.js"]
