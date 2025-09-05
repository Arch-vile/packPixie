# Multi-stage build for production optimization
FROM node:20-alpine AS base

# Install pnpm globally
RUN npm install -g pnpm@10.12.1

# Set working directory
WORKDIR /app

# Copy package manager files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy package.json files for all workspaces
COPY apps/api/package.json ./apps/api/
COPY apps/client/package.json ./apps/client/
COPY packages/model/package.json ./packages/model/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS builder

# Copy source code
COPY apps/api/ ./apps/api/
COPY apps/client/ ./apps/client/
COPY packages/model/ ./packages/model/
COPY turbo.json ./

# Build both applications
RUN pnpm build --filter=api

# Set environment variable to indicate running in Docker
ENV VITE_RUNNING_IN_DOCKER=true
RUN pnpm build --filter=packpixie

# Production stage with nginx
FROM nginx:alpine AS production

# Install node for API
RUN apk add --no-cache nodejs npm

# Install pnpm globally
RUN npm install -g pnpm@10.12.1

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Set up directories
WORKDIR /app

# Copy package manager files for dependency installation
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/model/package.json ./packages/model/

# Copy built model package
COPY --from=builder --chown=nodejs:nodejs /app/packages/model ./packages/model

# Install production dependencies
RUN pnpm install --frozen-lockfile --filter=api --prod

# Copy built API
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist ./apps/api/dist

# Copy built client to nginx html directory
COPY --from=builder /app/apps/client/dist /usr/share/nginx/html

# Create nginx configuration
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    \
    # Serve client files \
    location / { \
        root /usr/share/nginx/html; \
        try_files $uri $uri/ /index.html; \
    } \
    \
    # Proxy API requests \
    location /api/ { \
        proxy_pass http://localhost:3001; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
    } \
    \
    # Health check endpoint \
    location /health { \
        proxy_pass http://localhost:3001/health; \
        proxy_http_version 1.1; \
        proxy_set_header Host $host; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Start both services - API in background, nginx in foreground
CMD sh -c "cd /app/apps/api && node dist/index.js & nginx -g 'daemon off;'"