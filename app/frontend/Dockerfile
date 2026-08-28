# Build stage
FROM node:18-alpine as build

WORKDIR /app

# Copy source code
COPY . .

# Install dependencies
RUN npm install


# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine as run

# Copy built files from build stage
COPY --from=build /app/build /usr/share/nginx/html
# Replace the default nginx config with our custom one
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]