# One Dockerfile builds ANY service. Pick it with --build-arg SERVICE=<folder>:
#   docker build -t pet-portal/pet:1.0.0 --build-arg SERVICE=pet services
# Same base image, same layout, same user for all 13 backend services (proposal: "one base image pattern").

# ---- stage 1: install production dependencies for this service + common only ----
FROM node:22-alpine AS deps
ARG SERVICE
WORKDIR /app
COPY package.json package-lock.json ./
COPY common/package.json common/
COPY ${SERVICE}/package.json ${SERVICE}/
RUN npm ci --omit=dev --workspace=${SERVICE} --include-workspace-root=false \
 && npm cache clean --force

# ---- stage 2: runtime ----
FROM node:22-alpine
ARG SERVICE
ARG VERSION=dev
ENV NODE_ENV=production \
    SERVICE_VERSION=${VERSION} \
    PORT=8080 \
    # Keep the JS heap small and predictable inside a 160Mi container limit.
    NODE_OPTIONS="--max-old-space-size=64 --max-semi-space-size=2"
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY common ./common
COPY ${SERVICE}/package.json ./${SERVICE}/package.json
COPY ${SERVICE}/src ./${SERVICE}/src
COPY ${SERVICE}/migration[s] ./${SERVICE}/migrations
WORKDIR /app/${SERVICE}
# Built-in non-root user of the node image (UID 1000).
USER node
EXPOSE 8080
CMD ["node", "src/index.js"]
