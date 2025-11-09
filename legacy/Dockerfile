# Базовый образ Python
FROM python:3.11-slim as base

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Установка рабочей директории
WORKDIR /app

# Копирование requirements.txt
COPY requirements.txt .

# Установка Python зависимостей
RUN pip install --no-cache-dir -r requirements.txt

# Копирование кода приложения
COPY . .

# API сервис
FROM base as api
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# Celery Worker
FROM base as worker
ENV PYTHONUNBUFFERED=1
CMD ["celery", "-A", "core.celery_app", "worker", "--loglevel=info"]

# Celery Beat
FROM base as beat
ENV PYTHONUNBUFFERED=1
CMD ["celery", "-A", "core.celery_app", "beat", "--loglevel=info"]

