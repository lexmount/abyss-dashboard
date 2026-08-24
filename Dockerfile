FROM node:22-alpine AS build

WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.29-alpine

ENV ABYSS_DASHBOARD_BACKEND_SCHEME=http \
    NGINX_PORT=8080

COPY apps/dashboard/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY apps/dashboard/docker/05-require-dashboard-env.sh /docker-entrypoint.d/05-require-dashboard-env.sh
COPY --from=build /workspace/apps/dashboard/dist /usr/share/nginx/html

RUN chmod 755 /docker-entrypoint.d/05-require-dashboard-env.sh

EXPOSE 8080
