FROM node:8
WORKDIR /usr/src/tika-server
COPY package*.json ./
RUN npm install --only=production
COPY src/ ./

ENV NODE_ENV production
EXPOSE 8088

CMD [ "node", "index.js" ]
