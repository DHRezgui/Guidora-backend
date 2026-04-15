FROM node:22-alpine
RUN apk add --no-cache netcat-openbsd curl
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]
