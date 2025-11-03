#!/bin/bash
# Backup script for database and Redis

set -e

BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

echo "💾 Backup Script - Мармеладный Дворик"
echo "====================================="
echo ""

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup MySQL
echo "📦 Backing up MySQL database..."
docker-compose exec -T mysql mysqldump \
    -u dvorik_user \
    -pdvorik_password \
    dvorik_db > $BACKUP_DIR/mysql_$DATE.sql

if [ -f $BACKUP_DIR/mysql_$DATE.sql ]; then
    SIZE=$(du -h $BACKUP_DIR/mysql_$DATE.sql | cut -f1)
    echo "✅ MySQL backup created: mysql_$DATE.sql ($SIZE)"
else
    echo "❌ MySQL backup failed!"
    exit 1
fi

# Backup Redis
echo ""
echo "📦 Backing up Redis..."
docker-compose exec -T redis redis-cli SAVE > /dev/null 2>&1
docker cp dvorik2-redis-1:/data/dump.rdb $BACKUP_DIR/redis_$DATE.rdb 2>/dev/null || \
docker cp dvorik2_redis_1:/data/dump.rdb $BACKUP_DIR/redis_$DATE.rdb 2>/dev/null

if [ -f $BACKUP_DIR/redis_$DATE.rdb ]; then
    SIZE=$(du -h $BACKUP_DIR/redis_$DATE.rdb | cut -f1)
    echo "✅ Redis backup created: redis_$DATE.rdb ($SIZE)"
else
    echo "⚠️  Redis backup skipped (not critical)"
fi

# Compress backups
echo ""
echo "🗜️  Compressing backups..."
tar -czf $BACKUP_DIR/backup_$DATE.tar.gz \
    $BACKUP_DIR/mysql_$DATE.sql \
    $BACKUP_DIR/redis_$DATE.rdb 2>/dev/null || \
tar -czf $BACKUP_DIR/backup_$DATE.tar.gz \
    $BACKUP_DIR/mysql_$DATE.sql

# Remove uncompressed files
rm -f $BACKUP_DIR/mysql_$DATE.sql
rm -f $BACKUP_DIR/redis_$DATE.rdb

ARCHIVE_SIZE=$(du -h $BACKUP_DIR/backup_$DATE.tar.gz | cut -f1)
echo "✅ Compressed backup created: backup_$DATE.tar.gz ($ARCHIVE_SIZE)"

# Cleanup old backups (keep last 7 days)
echo ""
echo "🧹 Cleaning up old backups (keeping last 7 days)..."
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete
REMAINING=$(ls -1 $BACKUP_DIR/backup_*.tar.gz 2>/dev/null | wc -l)
echo "✅ Cleanup complete. Backups remaining: $REMAINING"

echo ""
echo "✅ Backup completed successfully!"
echo "📁 Backup location: $BACKUP_DIR/backup_$DATE.tar.gz"
echo ""
echo "💡 To restore from backup:"
echo "   # MySQL:"
echo "   gunzip -c $BACKUP_DIR/backup_$DATE.tar.gz | tar -xOf - mysql_$DATE.sql | \\"
echo "   docker-compose exec -T mysql mysql -u dvorik_user -pdvorik_password dvorik_db"
echo ""

