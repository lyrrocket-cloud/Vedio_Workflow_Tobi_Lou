# syntax=docker/dockerfile:1

# ========== 阶段一：完整依赖（构建期用） ==========
FROM node:20-bookworm-slim AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ========== 阶段二：构建 Next.js 与自定义 Server ==========
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# 与 scripts/build.sh 保持一致：next build + tsup 打包 server.ts
RUN pnpm next build && \
    pnpm tsup src/server.ts --format cjs --platform node --target node20 \
      --outDir dist --no-splitting --no-minify

# ========== 阶段三：仅生产依赖（运行期用） ==========
FROM node:20-bookworm-slim AS prod-deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ========== 阶段四：运行镜像 ==========
FROM node:20-bookworm-slim AS runner
WORKDIR /app
# COZE_PROJECT_ENV=PROD 使 src/server.ts 以生产模式运行（dev=false）
ENV NODE_ENV=production \
    COZE_PROJECT_ENV=PROD \
    PORT=5000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
# 静态 ffmpeg（字幕 VAD 兜底依赖），路径解析见 src/lib/vad.ts
COPY --from=builder /app/vendor ./vendor
COPY package.json next.config.ts ./

RUN chmod +x /app/vendor/ffmpeg-linux-x64

EXPOSE 5000

CMD ["node", "dist/server.js"]
