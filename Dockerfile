# Leads API container (backend only). The frontend is a static build (`npm run build`).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY shared ./shared
COPY server ./server
RUN npm run build:api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist-server ./dist-server
COPY netlify/database/migrations ./netlify/database/migrations
USER node
EXPOSE 3001
# Apply pending migrations with the owner role, then start the API with the app role.
CMD ["sh", "-c", "node dist-server/migrate.js && node dist-server/index.js"]
