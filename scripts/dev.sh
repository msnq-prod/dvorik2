#!/bin/bash
# Development helper script

COMMAND=$1

case $COMMAND in
    "start")
        echo "🚀 Starting development environment..."
        docker-compose up -d
        echo "✅ Services started!"
        echo "📊 Status:"
        docker-compose ps
        ;;
    
    "stop")
        echo "🛑 Stopping development environment..."
        docker-compose down
        echo "✅ Services stopped!"
        ;;
    
    "restart")
        echo "🔄 Restarting development environment..."
        docker-compose restart
        echo "✅ Services restarted!"
        ;;
    
    "logs")
        SERVICE=$2
        if [ -z "$SERVICE" ]; then
            docker-compose logs -f
        else
            docker-compose logs -f $SERVICE
        fi
        ;;
    
    "shell")
        SERVICE=${2:-api}
        echo "🐚 Opening shell in $SERVICE..."
        docker-compose exec $SERVICE /bin/sh
        ;;
    
    "db")
        echo "🗄️  Opening MySQL shell..."
        docker-compose exec mysql mysql -u dvorik_user -pdvorik_password dvorik_db
        ;;
    
    "redis")
        echo "🔴 Opening Redis CLI..."
        docker-compose exec redis redis-cli
        ;;
    
    "migrate")
        echo "🗄️  Running migrations..."
        docker-compose exec api alembic upgrade head
        echo "✅ Migrations completed!"
        docker-compose exec api alembic current
        ;;
    
    "migrate-create")
        MESSAGE=$2
        if [ -z "$MESSAGE" ]; then
            echo "❌ Please provide migration message"
            echo "Usage: ./dev.sh migrate-create 'add new field'"
            exit 1
        fi
        echo "📝 Creating new migration: $MESSAGE"
        docker-compose exec api alembic revision --autogenerate -m "$MESSAGE"
        ;;
    
    "test")
        echo "🧪 Running tests..."
        ./scripts/test_api.sh
        ;;
    
    "backup")
        echo "💾 Creating backup..."
        ./scripts/backup.sh
        ;;
    
    "clean")
        echo "🧹 Cleaning up..."
        docker-compose down -v
        echo "✅ All containers and volumes removed!"
        ;;
    
    "rebuild")
        echo "🔨 Rebuilding containers..."
        docker-compose down
        docker-compose build --no-cache
        docker-compose up -d
        echo "✅ Containers rebuilt!"
        ;;
    
    "stats")
        echo "📊 Container stats:"
        docker stats --no-stream
        ;;
    
    "webhooks")
        echo "🔗 Setting up webhooks..."
        INTERNAL_API_KEY=$(grep INTERNAL_API_KEY .env | cut -d '=' -f2)
        curl -X POST http://localhost:8000/internal/set-webhooks \
            -H "X-API-Key: $INTERNAL_API_KEY"
        echo ""
        ;;
    
    *)
        echo "🍬 Мармеладный Дворик - Development Helper"
        echo "========================================="
        echo ""
        echo "Usage: ./dev.sh <command> [options]"
        echo ""
        echo "Commands:"
        echo "  start              Start all services"
        echo "  stop               Stop all services"
        echo "  restart            Restart all services"
        echo "  logs [service]     View logs (all or specific service)"
        echo "  shell [service]    Open shell in container (default: api)"
        echo "  db                 Open MySQL shell"
        echo "  redis              Open Redis CLI"
        echo "  migrate            Run database migrations"
        echo "  migrate-create     Create new migration"
        echo "  test               Run API tests"
        echo "  backup             Create database backup"
        echo "  clean              Remove all containers and volumes"
        echo "  rebuild            Rebuild containers from scratch"
        echo "  stats              Show container resource usage"
        echo "  webhooks           Setup Telegram webhooks"
        echo ""
        echo "Examples:"
        echo "  ./dev.sh start"
        echo "  ./dev.sh logs api"
        echo "  ./dev.sh shell worker"
        echo "  ./dev.sh migrate-create 'add user phone field'"
        echo ""
        ;;
esac

