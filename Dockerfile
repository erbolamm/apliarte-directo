FROM node:22-alpine

WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm install --omit=dev

# Copiar código fuente de la aplicación
COPY . .

# Variables por defecto
ENV NODE_ENV=production
# Inside the container the server must listen on all interfaces (the host maps the port).
ENV HOST=0.0.0.0
EXPOSE 7979

CMD ["node", "server.js"]
