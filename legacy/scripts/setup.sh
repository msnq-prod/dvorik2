#!/bin/bash
# Setup script for initial project configuration

set -e

echo "🍬 Мармеладный Дворик - Setup Script"
echo "===================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env created! Please edit it with your tokens:"
    echo "   - TELEGRAM_BOT_TOKEN"
    echo "   - TELEGRAM_AUTH_BOT_TOKEN"
    echo "   - SUPERADMIN_TELEGRAM_ID"
    echo "   - JWT_SECRET_KEY (run: openssl rand -hex 32)"
    echo "   - INTERNAL_API_KEY (run: openssl rand -hex 32)"
    echo "   - TELEGRAM_WEBHOOK_SECRET (run: openssl rand -hex 32)"
    echo ""
    read -p "Press Enter after you've edited .env file..."
else
    echo "✅ .env file already exists"
fi

# Generate secrets if needed
echo ""
echo "🔐 Generated secrets (add these to .env if not done yet):"
echo "JWT_SECRET_KEY=$(openssl rand -hex 32)"
echo "INTERNAL_API_KEY=$(openssl rand -hex 32)"
echo "TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found! Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found! Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Start services
echo "🚀 Starting Docker services..."
docker-compose up -d

echo "⏳ Waiting for services to be ready (30 seconds)..."
sleep 30

# Check services
echo ""
echo "📊 Service status:"
docker-compose ps

# Apply migrations
echo ""
echo "🗄️  Applying database migrations..."
docker-compose exec -T api alembic upgrade head

# Check migration status
echo ""
echo "📝 Current migration version:"
docker-compose exec -T api alembic current

# Setup webhooks
echo ""
echo "🔗 Setting up Telegram webhooks..."
INTERNAL_API_KEY=$(grep INTERNAL_API_KEY .env | cut -d '=' -f2)

if [ -z "$INTERNAL_API_KEY" ]; then
    echo "⚠️  INTERNAL_API_KEY not found in .env"
    echo "   Please set webhooks manually:"
    echo "   curl -X POST http://localhost:8000/internal/set-webhooks -H 'X-API-Key: YOUR_KEY'"
else
    RESPONSE=$(curl -s -X POST http://localhost:8000/internal/set-webhooks \
        -H "X-API-Key: $INTERNAL_API_KEY")
    echo "Response: $RESPONSE"
fi

echo ""
echo "✅ Setup completed!"
echo ""
echo "📚 Next steps:"
echo "   1. Check API docs: http://localhost:8000/api/docs"
echo "   2. Check health: http://localhost:8000/health"
echo "   3. Check Flower: http://localhost:5555"
echo "   4. Test your Telegram bots!"
echo ""
echo "🐛 View logs:"
echo "   docker-compose logs -f api"
echo "   docker-compose logs -f worker"
echo "   docker-compose logs -f beat"
echo ""

