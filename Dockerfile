# LifeSync AI · imagen unificada (API FastAPI + interfaz compilada)
# Uso:  docker build -t lifesync-ai .   &&   docker run -p 8000:8000 -v lifesync-data:/data lifesync-ai

# ---------- Etapa 1: compilar la interfaz ----------
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Se pueden pasar en build:  --build-arg VITE_API_URL=https://api.midominio.com/api
ARG VITE_API_URL=""
ARG VITE_BASE="/"
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BASE=$VITE_BASE
RUN npm run build

# ---------- Etapa 2: API + interfaz ----------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install -r backend/requirements.txt

COPY backend/app ./backend/app
COPY shared ./shared
COPY --from=web /web/dist ./frontend/dist

ENV DATABASE_URL="sqlite:////data/lifesync.db" \
    APP_SECRET_KEY="cambia-esta-clave-en-produccion" \
    CORS_ORIGINS="http://localhost:8000" \
    DEFAULT_LLM_PROVIDER="demo"

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

CMD ["python", "-m", "uvicorn", "app.main:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "8000"]
