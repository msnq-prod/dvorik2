#!/bin/bash
# Backup script for database and Redis

set -e

# Configuration
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
MYSQL_USER="marmeladny"
MYSQL_PASSWORD="marmeladny_password"
MYSQL_DATABASE="marmeladny_dvorik"

echo "💾 Backup Script - Мармеладный Дворик"
echo "====================================="
echo "📅 Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup MySQL
echo "📦 Backing up MySQL database..."
docker-compose exec -T mysql mysqldump \
    -u $MYSQL_USER \
    -p$MYSQL_PASSWORD \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    $MYSQL_DATABASE | gzip > $BACKUP_DIR/mysql_$DATE.sql.gz

if [ -f $BACKUP_DIR/mysql_$DATE.sql.gz ]; then
    SIZE=$(du -h $BACKUP_DIR/mysql_$DATE.sql.gz | cut -f1)
    echo "✅ MySQL backup created: mysql_$DATE.sql.gz ($SIZE)"
    
    # Verify gzip integrity
    if gunzip -t $BACKUP_DIR/mysql_$DATE.sql.gz 2>/dev/null; then
        echo "✅ Backup integrity verified"
    else
        echo "⚠️  Warning: Backup file may be corrupted"
    fi
else
    echo "❌ MySQL backup failed!"
    exit 1
fi

# Cleanup old backups (keep last 30 days)
echo ""
echo "🧹 Cleaning up old backups (keeping last 30 days)..."
find $BACKUP_DIR -name "mysql_*.sql.gz" -mtime +30 -delete
REMAINING=$(ls -1 $BACKUP_DIR/mysql_*.sql.gz 2>/dev/null | wc -l)
echo "✅ Cleanup complete. Backups remaining: $REMAINING"

echo ""
echo "✅ Backup completed successfully!"
echo "📁 Backup location: $BACKUP_DIR/mysql_$DATE.sql.gz"
echo ""
echo "💡 To restore from backup, see docs/BACKUP_RESTORE.md"
echo "   Quick restore:"
echo "   gunzip < $BACKUP_DIR/mysql_$DATE.sql.gz | \\"
echo "   docker-compose exec -T mysql mysql -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE"
echo ""

