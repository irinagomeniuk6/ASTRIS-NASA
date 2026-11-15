# Alternative deployment. Render blueprint uses the native Node.js runtime.
FROM node:22-bookworm-slim
WORKDIR /app
ENV HOST=0.0.0.0
ENV PORT=4173
COPY . /app
RUN npm run build
EXPOSE 4173
CMD ["npm", "start"]
