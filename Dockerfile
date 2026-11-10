# Glowing Space BD — single-image production build.
# Stage 1 compiles the storefront (Vite) and the backend (esbuild).
# Stage 2 ships only the runtime: dist/, backend bundles, migrations, prod deps.

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm run server:build

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd -r gsbd && useradd -r -g gsbd gsbd \
  && mkdir -p /app/data/uploads /app/backups \
  && chown -R gsbd:gsbd /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build --chown=gsbd:gsbd /app/dist ./dist
COPY --from=build --chown=gsbd:gsbd /app/backend/dist ./backend/dist
COPY --from=build --chown=gsbd:gsbd /app/backend/migrations ./backend/migrations
USER gsbd
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"
CMD ["node", "backend/dist/server.mjs"]
