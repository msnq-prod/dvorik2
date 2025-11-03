# Backup and Restore Guide

## Overview

This guide describes procedures for backing up and restoring the Мармеладный Дворик system, including database, Redis data, and configuration files.

## Backup Strategy

### What to Backup

1. **MySQL Database** - All application data
2. **Redis Data** (optional) - FSM states and cache (can be rebuilt)
3. **Environment Configuration** - `.env` file
4. **User Uploads** - If any (currently not applicable)

### Backup Schedule

- **Production**: Daily automated backups at 3:00 AM (VVO timezone)
- **Retention**: 30 daily, 12 weekly, 12 monthly backups
- **Storage**: Off-site backup storage (S3, Google Cloud Storage, etc.)

## MySQL Database Backup

### Automated Backup (Recommended)

The system includes an automated backup script at `scripts/backup.sh`.

```bash
# Run backup manually
./scripts/backup.sh

# Or via Make
make backup
```

The script:
- Creates timestamped MySQL dumps
- Compresses with gzip
- Stores in `backups/` directory
- Includes all tables and data
- Uses `--single-transaction` for consistency

### Manual Backup

```bash
# Full database backup
docker-compose exec mysql mysqldump \
  -u marmeladny \
  -pmarmeladny_password \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  marmeladny_dvorik | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Verify backup
gunzip < backup_YYYYMMDD_HHMMSS.sql.gz | head -n 20
```

### Schema-Only Backup

```bash
# Backup only schema (no data)
docker-compose exec mysql mysqldump \
  -u marmeladny \
  -pmarmeladny_password \
  --no-data \
  --routines \
  --triggers \
  marmeladny_dvorik > schema_$(date +%Y%m%d).sql
```

## Redis Backup (Optional)

Redis data is mostly ephemeral (cache, FSM states) and can be rebuilt. However, if needed:

### Manual Redis Backup

```bash
# Trigger Redis save
docker-compose exec redis redis-cli SAVE

# Copy RDB file
docker cp marmeladny_redis:/data/dump.rdb backup_redis_$(date +%Y%m%d).rdb
```

### Note on Redis Data

- **FSM States**: Expire after 10 minutes, not critical to backup
- **Subscription Cache**: Rebuilds on first access
- **Celery Tasks**: Should complete or fail, not critical to backup

## Restore Procedures

### Database Restore

#### Full Restore

```bash
# 1. Stop the application
docker-compose stop api worker beat

# 2. Decompress backup
gunzip backup_YYYYMMDD_HHMMSS.sql.gz

# 3. Drop and recreate database (CAUTION!)
docker-compose exec mysql mysql -u root -prootpassword -e "DROP DATABASE IF EXISTS marmeladny_dvorik; CREATE DATABASE marmeladny_dvorik CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 4. Restore database
docker-compose exec -T mysql mysql \
  -u marmeladny \
  -pmarmeladny_password \
  marmeladny_dvorik < backup_YYYYMMDD_HHMMSS.sql

# 5. Verify restoration
docker-compose exec mysql mysql \
  -u marmeladny \
  -pmarmeladny_password \
  marmeladny_dvorik \
  -e "SHOW TABLES; SELECT COUNT(*) FROM users;"

# 6. Start the application
docker-compose start api worker beat
```

#### Partial Restore (Single Table)

```bash
# Extract single table from backup
gunzip < backup_YYYYMMDD_HHMMSS.sql.gz | \
  sed -n '/Table structure for table.*users/,/Table structure for table/p' > users_table.sql

# Restore single table
docker-compose exec -T mysql mysql \
  -u marmeladny \
  -pmarmeladny_password \
  marmeladny_dvorik < users_table.sql
```

### Redis Restore

```bash
# 1. Stop Redis
docker-compose stop redis

# 2. Copy backup to Redis container
docker cp backup_redis_YYYYMMDD.rdb marmeladny_redis:/data/dump.rdb

# 3. Set permissions
docker-compose exec redis chown redis:redis /data/dump.rdb

# 4. Start Redis
docker-compose start redis

# 5. Verify
docker-compose exec redis redis-cli DBSIZE
```

## Disaster Recovery

### Complete System Recovery

1. **Provision New Server**
   ```bash
   # Install Docker and Docker Compose
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   sudo usermod -aG docker $USER
   ```

2. **Clone Repository**
   ```bash
   git clone <repository-url> dvorik2
   cd dvorik2
   ```

3. **Restore Configuration**
   ```bash
   # Copy .env from backup
   cp /path/to/backup/.env .env
   
   # Verify configuration
   cat .env | grep -v "^#" | grep -v "^$"
   ```

4. **Start Services**
   ```bash
   docker-compose up -d mysql redis
   
   # Wait for services to be ready
   sleep 30
   ```

5. **Restore Database**
   ```bash
   gunzip backup_YYYYMMDD_HHMMSS.sql.gz
   docker-compose exec -T mysql mysql \
     -u marmeladny \
     -pmarmeladny_password \
     marmeladny_dvorik < backup_YYYYMMDD_HHMMSS.sql
   ```

6. **Run Migrations (if needed)**
   ```bash
   docker-compose up -d api
   docker-compose exec api alembic upgrade head
   ```

7. **Start All Services**
   ```bash
   docker-compose up -d
   ```

8. **Verify System**
   ```bash
   # Check health
   curl http://localhost:8000/health
   
   # Check database
   docker-compose exec api python -c "
   from sqlalchemy import create_engine, text
   from core.config import settings
   engine = create_engine(settings.DB_URL_SYNC)
   with engine.connect() as conn:
       result = conn.execute(text('SELECT COUNT(*) FROM users'))
       print(f'Users count: {result.scalar()}')
   "
   ```

9. **Update DNS/Webhooks**
   ```bash
   # Update Telegram webhooks
   make webhooks
   ```

## Backup Testing

### Monthly Backup Test

Perform a restore test monthly to ensure backups are valid:

```bash
# 1. Create test database
docker-compose exec mysql mysql -u root -prootpassword \
  -e "CREATE DATABASE test_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. Restore to test database
gunzip < latest_backup.sql.gz | \
docker-compose exec -T mysql mysql \
  -u root \
  -prootpassword \
  test_restore

# 3. Verify table counts
docker-compose exec mysql mysql -u root -prootpassword test_restore -e "
SELECT 
  table_name,
  table_rows
FROM information_schema.tables
WHERE table_schema = 'test_restore'
ORDER BY table_name;
"

# 4. Clean up
docker-compose exec mysql mysql -u root -prootpassword \
  -e "DROP DATABASE test_restore;"
```

## Backup Monitoring

### Check Backup Size

```bash
# Check recent backups
ls -lh backups/ | tail -n 10

# Check backup growth
du -sh backups/*
```

### Verify Backup Integrity

```bash
# Test gzip integrity
gunzip -t backup_YYYYMMDD_HHMMSS.sql.gz

# Check SQL syntax (first 1000 lines)
gunzip < backup_YYYYMMDD_HHMMSS.sql.gz | head -n 1000 | mysql --help
```

## Automated Backup Setup

### Cron Job (Linux/Mac)

```bash
# Edit crontab
crontab -e

# Add backup job (daily at 3 AM)
0 3 * * * cd /path/to/dvorik2 && ./scripts/backup.sh >> /var/log/dvorik_backup.log 2>&1
```

### Backup Rotation Script

Create `scripts/rotate_backups.sh`:

```bash
#!/bin/bash
# Rotate backups: Keep 30 daily, 12 weekly, 12 monthly

BACKUP_DIR="backups"
DAILY_KEEP=30
WEEKLY_KEEP=12
MONTHLY_KEEP=12

# Remove old daily backups
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +$DAILY_KEEP -delete

# Keep weekly backups (first backup of each week)
# Keep monthly backups (first backup of each month)
# Implementation depends on your backup naming convention
```

## Security Considerations

1. **Encrypt Backups**
   ```bash
   # Encrypt backup
   gpg --symmetric --cipher-algo AES256 backup.sql.gz
   
   # Decrypt backup
   gpg --decrypt backup.sql.gz.gpg > backup.sql.gz
   ```

2. **Secure Transfer**
   ```bash
   # Upload to S3 (example)
   aws s3 cp backup.sql.gz.gpg s3://your-bucket/backups/ --storage-class GLACIER
   ```

3. **Backup .env File Separately**
   ```bash
   # Encrypt .env
   gpg --symmetric --cipher-algo AES256 .env
   
   # Store encrypted .env in secure location
   ```

## Troubleshooting

### Backup Fails with "Access Denied"

```bash
# Check MySQL user permissions
docker-compose exec mysql mysql -u root -prootpassword \
  -e "SHOW GRANTS FOR 'marmeladny'@'%';"

# Grant necessary privileges
docker-compose exec mysql mysql -u root -prootpassword \
  -e "GRANT SELECT, LOCK TABLES, SHOW VIEW ON marmeladny_dvorik.* TO 'marmeladny'@'%';"
```

### Restore Fails with "Table Already Exists"

```bash
# Add --force flag or drop database first
docker-compose exec mysql mysql -u root -prootpassword \
  -e "DROP DATABASE marmeladny_dvorik; CREATE DATABASE marmeladny_dvorik;"
```

### Backup File Too Large

```bash
# Use maximum compression
docker-compose exec mysql mysqldump ... | gzip -9 > backup.sql.gz

# Or split into smaller files
docker-compose exec mysql mysqldump ... | split -b 100M - backup.sql.gz.part
```

## Checklist

### Before Backup
- [ ] Ensure MySQL is running
- [ ] Check available disk space
- [ ] Verify MySQL user permissions

### After Backup
- [ ] Verify backup file exists and size is reasonable
- [ ] Test gzip integrity
- [ ] Copy to off-site storage
- [ ] Update backup log

### Before Restore
- [ ] **VERIFY YOU HAVE CURRENT BACKUP**
- [ ] Stop application services
- [ ] Notify team members
- [ ] Test restore on non-production first (if possible)

### After Restore
- [ ] Verify table counts
- [ ] Check data integrity
- [ ] Run application tests
- [ ] Restart all services
- [ ] Monitor logs for errors

## Contact

For backup/restore issues, contact the DevOps team or refer to the main documentation.

