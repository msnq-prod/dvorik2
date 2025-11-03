# Deployment Guide - Мармеладный Дворик

## 🚀 Quick Start (Development)

### 1. Подготовка окружения

```bash
# Установить Python 3.11+
python3 --version

# Создать виртуальное окружение
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# или
venv\Scripts\activate  # Windows

# Установить зависимости
pip install -r requirements.txt
```

### 2. Настройка переменных окружения

```bash
# Скопировать шаблон
cp .env.example .env

# Отредактировать .env и заполнить:
# - TELEGRAM_BOT_TOKEN (получить у @BotFather)
# - TELEGRAM_AUTH_BOT_TOKEN (получить у @BotFather)
# - SUPERADMIN_TELEGRAM_ID (ваш Telegram ID)
# - JWT_SECRET_KEY (сгенерировать: openssl rand -hex 32)
# - INTERNAL_API_KEY (сгенерировать: openssl rand -hex 32)
# - TELEGRAM_WEBHOOK_SECRET (сгенерировать: openssl rand -hex 32)
```

### 3. Запуск через Docker Compose (рекомендуется)

```bash
# Поднять все сервисы
docker-compose up -d

# Проверить статус
docker-compose ps

# Посмотреть логи
docker-compose logs -f

# Применить миграции
docker-compose exec api alembic upgrade head

# Установить webhooks
curl -X POST http://localhost:8000/internal/set-webhooks \
  -H "X-API-Key: YOUR_INTERNAL_API_KEY"
```

### 4. Локальный запуск (без Docker)

**Терминал 1: MySQL**
```bash
# Установить MySQL 8.0+
# Создать БД:
mysql -u root -p
CREATE DATABASE dvorik_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'dvorik_user'@'localhost' IDENTIFIED BY 'dvorik_password';
GRANT ALL PRIVILEGES ON dvorik_db.* TO 'dvorik_user'@'localhost';
FLUSH PRIVILEGES;
```

**Терминал 2: Redis**
```bash
# Установить Redis
redis-server
```

**Терминал 3: API**
```bash
source venv/bin/activate
alembic upgrade head
python run.py
# или
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Терминал 4: Celery Worker**
```bash
source venv/bin/activate
celery -A core.celery_app worker --loglevel=info --pool=solo
```

**Терминал 5: Celery Beat**
```bash
source venv/bin/activate
celery -A core.celery_app beat --loglevel=info
```

**Терминал 6: Flower (опционально)**
```bash
source venv/bin/activate
celery -A core.celery_app flower --port=5555
```

## 🔧 Production Deployment

### 1. Сервер (Ubuntu 22.04 LTS)

```bash
# Обновить систему
sudo apt update && sudo apt upgrade -y

# Установить Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Установить Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. Настройка приложения

```bash
# Клонировать репозиторий
git clone <repository-url>
cd dvorik2

# Создать .env для production
cp .env.example .env
nano .env

# Важно! Изменить:
# - ENVIRONMENT=production
# - Все пароли и секретные ключи
# - API_BASE_URL=https://your-domain.com
# - DATABASE_PASSWORD (надежный пароль)
# - REDIS_PASSWORD (надежный пароль)
```

### 3. Запуск в production

```bash
# Поднять сервисы
docker-compose -f docker-compose.yml up -d

# Применить миграции
docker-compose exec api alembic upgrade head

# Проверить логи
docker-compose logs -f api
docker-compose logs -f worker
docker-compose logs -f beat
```

### 4. Настройка Nginx (Reverse Proxy)

```nginx
# /etc/nginx/sites-available/dvorik

upstream api_backend {
    server 127.0.0.1:8000;
}

server {
    listen 80;
    server_name your-domain.com;

    # Redirect to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Logs
    access_log /var/log/nginx/dvorik_access.log;
    error_log /var/log/nginx/dvorik_error.log;

    # Proxy settings
    location / {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Telegram webhooks (no auth required)
    location /webhooks/ {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Max body size for uploads
    client_max_body_size 10M;
}
```

```bash
# Включить конфигурацию
sudo ln -s /etc/nginx/sites-available/dvorik /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Установить SSL сертификат
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 5. Установка Telegram Webhooks

```bash
# Установить webhooks для обоих ботов
curl -X POST https://your-domain.com/internal/set-webhooks \
  -H "X-API-Key: YOUR_INTERNAL_API_KEY"

# Проверить статус
curl -X GET https://your-domain.com/internal/webhook-info \
  -H "X-API-Key: YOUR_INTERNAL_API_KEY"
```

### 6. Мониторинг

**Логи**
```bash
# API логи
docker-compose logs -f api

# Worker логи
docker-compose logs -f worker

# Beat логи
docker-compose logs -f beat

# Все логи
docker-compose logs -f
```

**Flower (Celery UI)**
```bash
# Доступ: http://your-domain.com:5555
# Закрыть в firewall, использовать только через SSH туннель
ssh -L 5555:localhost:5555 user@your-server
```

**Health Checks**
```bash
# API health
curl https://your-domain.com/health

# Database connection
docker-compose exec api alembic current

# Redis connection
docker-compose exec redis redis-cli ping
```

## 🔒 Security Checklist

- [ ] Изменены все пароли и секретные ключи
- [ ] HTTPS настроен (Let's Encrypt)
- [ ] Firewall настроен (только 80, 443, 22)
- [ ] SSH ключи вместо паролей
- [ ] Flower защищен (закрыт в firewall)
- [ ] Backup базы данных настроен
- [ ] Логирование настроено
- [ ] Rate limiting настроен в Nginx
- [ ] CORS настроен правильно

## 📊 Backup Strategy

### Database Backup

```bash
# Создать backup скрипт
cat > /opt/dvorik/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/dvorik/backups"
mkdir -p $BACKUP_DIR

# MySQL backup
docker-compose exec -T mysql mysqldump -u dvorik_user -pdvorik_password dvorik_db > $BACKUP_DIR/db_$DATE.sql

# Redis backup
docker-compose exec -T redis redis-cli --rdb /data/dump.rdb
cp /var/lib/docker/volumes/dvorik2_redis_data/_data/dump.rdb $BACKUP_DIR/redis_$DATE.rdb

# Compress
tar -czf $BACKUP_DIR/backup_$DATE.tar.gz $BACKUP_DIR/db_$DATE.sql $BACKUP_DIR/redis_$DATE.rdb
rm $BACKUP_DIR/db_$DATE.sql $BACKUP_DIR/redis_$DATE.rdb

# Keep only last 7 days
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete

echo "Backup completed: backup_$DATE.tar.gz"
EOF

chmod +x /opt/dvorik/backup.sh

# Добавить в crontab (каждый день в 3:00)
crontab -e
0 3 * * * /opt/dvorik/backup.sh >> /var/log/dvorik_backup.log 2>&1
```

## 🔄 Update & Maintenance

### Обновление приложения

```bash
# Остановить сервисы
docker-compose down

# Обновить код
git pull origin main

# Пересобрать образы
docker-compose build

# Применить миграции
docker-compose up -d mysql redis
docker-compose run --rm api alembic upgrade head

# Запустить все сервисы
docker-compose up -d

# Проверить логи
docker-compose logs -f
```

### Откат миграций

```bash
# Посмотреть текущую версию
docker-compose exec api alembic current

# Откатить на одну версию назад
docker-compose exec api alembic downgrade -1

# Откатить на конкретную версию
docker-compose exec api alembic downgrade <revision>
```

## 📈 Scaling

### Horizontal Scaling (Workers)

```bash
# Запустить больше worker'ов
docker-compose up -d --scale worker=3

# Мониторить нагрузку
docker stats
```

### Vertical Scaling (Resources)

Отредактировать `docker-compose.yml`:

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

## 🐛 Troubleshooting

### API не запускается

```bash
# Проверить логи
docker-compose logs api

# Проверить переменные окружения
docker-compose exec api env | grep DATABASE

# Проверить подключение к БД
docker-compose exec api python -c "from core.database import engine; print('OK')"
```

### Миграции не применяются

```bash
# Проверить текущую версию
docker-compose exec api alembic current

# Проверить историю
docker-compose exec api alembic history

# Применить принудительно
docker-compose exec api alembic upgrade head --sql
docker-compose exec api alembic upgrade head
```

### Celery задачи не выполняются

```bash
# Проверить worker логи
docker-compose logs worker

# Проверить beat логи
docker-compose logs beat

# Проверить Redis
docker-compose exec redis redis-cli ping

# Проверить очередь задач
docker-compose exec redis redis-cli llen celery
```

## 📞 Support

При возникновении проблем:
1. Проверить логи: `docker-compose logs -f`
2. Проверить health: `curl http://localhost:8000/health`
3. Проверить документацию API: `http://localhost:8000/api/docs`

