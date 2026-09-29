FROM node:22-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY src ./src
COPY public ./public
COPY server.js .
# Inside the container the server must listen on all interfaces (the host maps the port).
ENV HOST=0.0.0.0
EXPOSE 7979
CMD ["node", "server.js"]
