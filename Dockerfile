# This is the main production Dockerfile.
# This is a production ready image.
# It does not include any development dependencies.

# Builds multiarch docker images
# https://docs.docker.com/build/building/multi-platform/
# https://www.docker.com/blog/multi-arch-build-and-images-the-simple-way/

# Supported architectures:
# linux/amd64, linux/arm64, linux/arm/v7
# https://github.com/docker-library/official-images#architectures-other-than-amd64

FROM node:18-slim
ENV NODE_ENV production
WORKDIR /usr/src/medplum
COPY ./ ./
RUN npm ci
# RUN npm run build # fails bc. 'turbo' is not found
EXPOSE 5000 8103
ENTRYPOINT [ "node", "packages/server/dist/index.js" ]
