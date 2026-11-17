# Dokploy build: Node server output (not the Cloudflare preset used by the Lovable preview).
FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
ENV NITRO_PRESET=node-server
RUN bun run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
