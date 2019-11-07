FROM node:8
WORKDIR /usr/src/file-parser
COPY package*.json ./
RUN npm install --only=production
COPY src/ ./

ENV NODE_ENV production
EXPOSE 8080

CMD [ "npm", "start" ]
