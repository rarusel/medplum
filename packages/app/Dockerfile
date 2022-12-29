FROM node:16
WORKDIR /usr/src/medplum/
COPY ./ ./
RUN npm ci
WORKDIR /usr/src/medplum/packages/app/
ENTRYPOINT [ "npm", "run", "start" ]
EXPOSE 3000