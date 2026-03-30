# Stage 1: Build
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .

# Build-time args from Railway env vars
ARG CUBEAI_API_KEY
ARG CUBEAI_BASE_URL
ARG CUBEAI_EXTERNAL_ID
ARG CUBEAI_TIMEOUT_MS

# DefinePlugin reads these during webpack build
ENV CUBEAI_API_KEY=$CUBEAI_API_KEY
ENV CUBEAI_BASE_URL=$CUBEAI_BASE_URL
ENV CUBEAI_EXTERNAL_ID=$CUBEAI_EXTERNAL_ID
ENV CUBEAI_TIMEOUT_MS=$CUBEAI_TIMEOUT_MS

RUN npm run build

# Stage 2: Serve
FROM nginx:alpine-slim

COPY nginx.conf /etc/nginx/nginx.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# Railway injects PORT dynamically -- envsubst replaces $PORT in nginx.conf
CMD ["/bin/sh", "-c", "envsubst '$PORT' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && nginx -g 'daemon off;'"]
