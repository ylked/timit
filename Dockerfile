# --- build the Svelte UI ---
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- runtime: Flask API + built UI ---
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY --from=web /web/dist web/dist

RUN mkdir -p /app/data

EXPOSE 5252

# --workers 1: SQLite handles one writer at a time, and this is a single-user app anyway.
CMD ["gunicorn", "--bind", "0.0.0.0:5252", "--workers", "1", "app:app"]
