FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/data/warehouse-initial-seed.json ./data/warehouse-initial-seed.json
COPY --from=build /app/scripts/build-warehouse-initial-db.mjs ./scripts/build-warehouse-initial-db.mjs
CMD ["npm", "start"]
