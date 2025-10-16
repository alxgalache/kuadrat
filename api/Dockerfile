FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Create uploads directories with proper permissions
# The node user in Alpine has UID 1000, which matches your host user
RUN mkdir -p /app/uploads/products /app/uploads/authors && \
    chown -R node:node /app

# Switch to non-root user (node user has UID 1000)
USER node

EXPOSE 3001

CMD ["npm", "run", "dev"]
