# syntax=docker/dockerfile:1

# node:24 traz npm 11, a mesma major que gera o package-lock.json aqui. Com o
# npm 10 do node:22 o `npm ci` recusava o lock: pacotes como tsx e vitest pedem
# esbuild ~0.28 e as duas versoes de npm resolvem essa arvore de forma diferente.
FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Imagem efemera para migrations, seed e outros comandos administrativos.
FROM deps AS tooling
COPY . .

FROM tooling AS builder
ENV NODE_ENV=production
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN apk add --no-cache libc6-compat \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs \
    && mkdir -p .next/cache /app/uploads \
    && chown -R nextjs:nodejs /app

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
