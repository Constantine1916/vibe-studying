FROM node:20-slim

WORKDIR /app

# Install basic tools the agent can use via Bash
RUN apt-get update && apt-get install -y \
  bash curl git python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npx tsc

CMD ["node", "dist/index.js"]
