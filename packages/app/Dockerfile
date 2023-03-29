FROM node:18
WORKDIR /usr/src/medplum/
COPY ./ ./
RUN npm ci
RUN npm run build
WORKDIR /usr/src/medplum/packages/app/
ENTRYPOINT [ "npm", "run", "start" ]
EXPOSE 3000