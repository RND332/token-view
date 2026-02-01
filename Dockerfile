# Multi-stage build: compile with Bun, serve with Nginx
FROM oven/bun:1.1 AS build
WORKDIR /app

# Install dependencies (Bun will create bun.lockb if missing)
COPY package.json ./
RUN bun install

# Copy source and build
COPY . .
RUN bun run build

# Production image: static assets via Nginx with SPA fallback
FROM nginx:1.27-alpine AS runtime
WORKDIR /usr/share/nginx/html

# Copy compiled assets
COPY --from=build /app/dist ./

# Custom Nginx config for SPA routing and asset caching
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 4173
CMD ["nginx", "-g", "daemon off;"]
