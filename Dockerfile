# Use Node.js LTS with Python support
FROM node:20-slim

# Install Python for AI assistance feature
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy Python requirements if exists and install
COPY AI_assistance_map/requirements.txt ./AI_assistance_map/
RUN python3 -m venv .venv && \
    .venv/bin/pip install --no-cache-dir -r AI_assistance_map/requirements.txt || true

# Copy application files
COPY server.js ./
COPY index.html ./
COPY script.js ./
COPY style.css ./
COPY utils.js ./

# Copy static data directories
COPY precipitation-data/ ./precipitation-data/
COPY flood-data/ ./flood-data/
COPY svi-data/ ./svi-data/
COPY river-gauge-data/ ./river-gauge-data/

# Copy built chat bundle
COPY dist/ ./dist/

# Copy AI assistance module
COPY AI_assistance_map/ ./AI_assistance_map/

# Expose the port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Start the server
CMD ["node", "server.js"]
