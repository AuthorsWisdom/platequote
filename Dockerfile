FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# prisma generate does not connect. The dummy URL keeps the schema valid at build time.
ENV DATABASE_URL="postgresql://platequote:platequote@localhost:5432/platequote"
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "docker/start.sh"]
