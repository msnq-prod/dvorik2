#!/bin/bash
# Test API endpoints

API_URL="http://localhost:8000"
INTERNAL_API_KEY="${INTERNAL_API_KEY:-your_internal_api_key}"

echo "🧪 Testing Мармеладный Дворик API"
echo "=================================="
echo ""

# Test 1: Health check
echo "1️⃣ Testing health endpoint..."
RESPONSE=$(curl -s $API_URL/health)
echo "Response: $RESPONSE"
if echo $RESPONSE | grep -q "healthy"; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed"
fi
echo ""

# Test 2: Root endpoint
echo "2️⃣ Testing root endpoint..."
RESPONSE=$(curl -s $API_URL/)
echo "Response: $RESPONSE"
if echo $RESPONSE | grep -q "running"; then
    echo "✅ Root endpoint passed"
else
    echo "❌ Root endpoint failed"
fi
echo ""

# Test 3: Webhook info
echo "3️⃣ Testing webhook info..."
RESPONSE=$(curl -s -X GET $API_URL/internal/webhook-info \
    -H "X-API-Key: $INTERNAL_API_KEY")
echo "Response: $RESPONSE"
if echo $RESPONSE | grep -q "main_bot"; then
    echo "✅ Webhook info passed"
else
    echo "❌ Webhook info failed (check INTERNAL_API_KEY)"
fi
echo ""

# Test 4: API docs
echo "4️⃣ Testing API docs..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $API_URL/api/docs)
if [ $STATUS -eq 200 ]; then
    echo "✅ API docs accessible at $API_URL/api/docs"
else
    echo "❌ API docs not accessible (status: $STATUS)"
fi
echo ""

# Test 5: Database connection
echo "5️⃣ Testing database connection..."
docker-compose exec -T api python -c "
from core.database import engine
try:
    with engine.connect() as conn:
        print('✅ Database connection successful')
except Exception as e:
    print(f'❌ Database connection failed: {e}')
" 2>/dev/null
echo ""

# Test 6: Redis connection
echo "6️⃣ Testing Redis connection..."
REDIS_PING=$(docker-compose exec -T redis redis-cli ping 2>/dev/null)
if [ "$REDIS_PING" = "PONG" ]; then
    echo "✅ Redis connection successful"
else
    echo "❌ Redis connection failed"
fi
echo ""

# Test 7: Celery worker
echo "7️⃣ Testing Celery worker..."
WORKER_STATUS=$(docker-compose ps worker | grep -c "Up")
if [ $WORKER_STATUS -eq 1 ]; then
    echo "✅ Celery worker is running"
else
    echo "❌ Celery worker is not running"
fi
echo ""

# Test 8: Celery beat
echo "8️⃣ Testing Celery beat..."
BEAT_STATUS=$(docker-compose ps beat | grep -c "Up")
if [ $BEAT_STATUS -eq 1 ]; then
    echo "✅ Celery beat is running"
else
    echo "❌ Celery beat is not running"
fi
echo ""

echo "🎉 API tests completed!"
echo ""
echo "📚 For more detailed testing:"
echo "   - Open API docs: $API_URL/api/docs"
echo "   - Open Flower: http://localhost:5555"
echo "   - Check logs: docker-compose logs -f"
echo ""

