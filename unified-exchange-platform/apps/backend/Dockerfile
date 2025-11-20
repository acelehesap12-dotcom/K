# Use Debian-based Node.js for better security
FROM node:20.18.1-slim AS builder

WORKDIR /app

# Install security updates
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends dumb-init && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci || npm install

COPY . .
RUN npm run build || echo "Build skipped"

# Production stage
FROM node:20.18.1-slim

WORKDIR /app

# Install security updates and required packages
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends dumb-init tini && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user (handle existing GID/UID)
RUN groupadd -g 1001 app 2>/dev/null || groupadd app && \
    useradd -r -u 1001 -g app app 2>/dev/null || useradd -r -g app app && \
    chown -R app:app /app

COPY package*.json ./
RUN npm ci --only=production || npm install --only=production && \
    npm cache clean --force

COPY --from=builder --chown=app:app /app/dist ./dist

# Security: Remove write permissions
RUN chmod -R 555 /app/dist && \
    chmod 444 /app/package.json

# Switch to non-root user
USER app

EXPOSE 3000

# Use tini as init system for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "dist/index.js"]
