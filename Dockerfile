# ── сборка ──
FROM node:22-bookworm-slim AS build
WORKDIR /app
# инструменты на случай, если для better-sqlite3 не найдётся готовой сборки
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ── запуск ──
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/content ./content
EXPOSE 8080
CMD ["node", "dist/server/src/index.js"]
