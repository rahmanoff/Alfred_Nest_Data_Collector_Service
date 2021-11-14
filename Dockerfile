FROM node:17-alpine

## Create app folder
RUN mkdir -p /home/nodejs/app

## Install node deps and compile native add-ons
WORKDIR /home/nodejs/app

COPY . .

RUN npm install

## Set up host
RUN apk --no-cache add curl

## Set permissions
COPY --chown=node:node . .

## Swap to node user
USER node

## Setup health check
HEALTHCHECK --start-period=60s --interval=10s --timeout=10s --retries=6 CMD ["./healthcheck.sh"]

EXPOSE 3978
