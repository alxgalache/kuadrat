FROM node:20.20-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# DEVELOPMENT: Install ALL dependencies (including devDependencies)
# This is needed for npm run dev, hot reloading, linting, etc.
RUN npm ci

# Copy application code
COPY . .

# DEVELOPMENT: Run as root to avoid permission issues with mounted volumes
# Note: Production Dockerfiles (Dockerfile.prod, Dockerfile.staging) use non-root users

EXPOSE 3000

# DEVELOPMENT: Use npm run dev for hot reloading
CMD ["npm", "run", "dev"]
