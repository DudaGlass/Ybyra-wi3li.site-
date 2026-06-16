FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install --production --no-audit --no-fund

# Copy application source
COPY . .

# Expose the API port
EXPOSE 3001

# Run as non-root user
USER node

# Start the server
CMD ["node", "server.js"]