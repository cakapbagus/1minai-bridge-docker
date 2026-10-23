FROM node:22-alpine
WORKDIR /app
# Tanpa dependency npm: cukup salin source.
COPY *.mjs models-cache.json model-ids.txt ./
ENV NODE_ENV=production HOST=0.0.0.0 PORT=20129
USER node
EXPOSE 20129
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||20129)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","bridge.mjs"]
