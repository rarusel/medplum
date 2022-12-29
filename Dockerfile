# This is the main production Dockerfile.
# This is a production ready image.
# It does not include any development dependencies.
FROM node:16-slim
ENV NODE_ENV production
WORKDIR /usr/src/medplum
COPY ./ ./
RUN npm ci
EXPOSE 5000 8103
ENTRYPOINT [ "node", "packages/server/dist/index.js" ]
