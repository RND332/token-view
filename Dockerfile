# Multi-stage build: compile with Bun, run SSR server via Bun
FROM oven/bun:1.1 AS build
WORKDIR /app

# Install dependencies (Bun will create bun.lockb if missing)
COPY package.json bun.lockb* ./
RUN bun install

# Copy source and build
COPY . .
RUN bun run build

# Production image: Bun runtime serving SSR + static assets
FROM oven/bun:1.1 AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/bun.lockb ./bun.lockb
COPY --from=build /app/dist ./dist
COPY server.js ./server.js

EXPOSE 4173
CMD ["bun", "server.js"]
