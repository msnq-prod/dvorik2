# Makefile for Мармеладный Дворик

.PHONY: help install setup start stop restart logs shell db redis migrate test backup clean build

help: ## Show this help message
	@echo "🍬 Мармеладный Дворик - Development Commands"
	@echo "==========================================="
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

install: ## Install Python dependencies locally
	pip install -r requirements.txt

setup: ## Initial setup (create .env, generate secrets)
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✅ .env created"; \
		echo ""; \
		echo "🔐 Generated secrets (add to .env):"; \
		echo "JWT_SECRET_KEY=$$(openssl rand -hex 32)"; \
		echo "INTERNAL_API_KEY=$$(openssl rand -hex 32)"; \
		echo "TELEGRAM_WEBHOOK_SECRET=$$(openssl rand -hex 32)"; \
		echo ""; \
		echo "⚠️  Please edit .env with your Telegram tokens!"; \
	else \
		echo "✅ .env already exists"; \
	fi

start: ## Start all Docker services
	docker-compose up -d
	@echo "⏳ Waiting for services to start..."
	@sleep 5
	@make status

stop: ## Stop all Docker services
	docker-compose down

restart: ## Restart all Docker services
	docker-compose restart
	@make status

status: ## Show service status
	@echo ""
	@echo "📊 Service Status:"
	@docker-compose ps

logs: ## Show logs (usage: make logs SERVICE=api)
	@if [ -z "$(SERVICE)" ]; then \
		docker-compose logs -f; \
	else \
		docker-compose logs -f $(SERVICE); \
	fi

shell: ## Open shell in container (usage: make shell SERVICE=api)
	@if [ -z "$(SERVICE)" ]; then \
		docker-compose exec api sh; \
	else \
		docker-compose exec $(SERVICE) sh; \
	fi

db: ## Open MySQL shell
	docker-compose exec mysql mysql -u dvorik_user -pdvorik_password dvorik_db

redis: ## Open Redis CLI
	docker-compose exec redis redis-cli

migrate: ## Apply database migrations
	docker-compose exec api alembic upgrade head
	@echo ""
	@echo "📝 Current version:"
	@docker-compose exec api alembic current

migrate-create: ## Create new migration (usage: make migrate-create MSG="your message")
	@if [ -z "$(MSG)" ]; then \
		echo "❌ Usage: make migrate-create MSG='your migration message'"; \
		exit 1; \
	fi
	docker-compose exec api alembic revision --autogenerate -m "$(MSG)"

migrate-downgrade: ## Downgrade one migration
	docker-compose exec api alembic downgrade -1

test: ## Run API tests
	@./scripts/test_api.sh

test-health: ## Quick health check
	@curl -s http://localhost:8000/health | python -m json.tool

backup: ## Create database backup
	@./scripts/backup.sh

clean: ## Remove all containers and volumes
	docker-compose down -v
	@echo "✅ Cleaned up"

build: ## Rebuild Docker images
	docker-compose build --no-cache

rebuild: ## Full rebuild (clean + build + start)
	@make clean
	@make build
	@make start
	@make migrate

webhooks: ## Setup Telegram webhooks
	@INTERNAL_API_KEY=$$(grep INTERNAL_API_KEY .env | cut -d '=' -f2); \
	if [ -z "$$INTERNAL_API_KEY" ]; then \
		echo "❌ INTERNAL_API_KEY not found in .env"; \
		exit 1; \
	fi; \
	curl -X POST http://localhost:8000/internal/set-webhooks \
		-H "X-API-Key: $$INTERNAL_API_KEY" | python -m json.tool

webhooks-info: ## Get webhook info
	@INTERNAL_API_KEY=$$(grep INTERNAL_API_KEY .env | cut -d '=' -f2); \
	curl -X GET http://localhost:8000/internal/webhook-info \
		-H "X-API-Key: $$INTERNAL_API_KEY" | python -m json.tool

stats: ## Show container resource usage
	docker stats --no-stream

ps: ## List all containers
	docker-compose ps

top: ## Show running processes in containers
	docker-compose top

# Development shortcuts
dev: start ## Alias for start

up: start ## Alias for start

down: stop ## Alias for stop

# Quick access to docs
docs: ## Open API documentation in browser
	@echo "Opening API docs..."
	@open http://localhost:8000/api/docs || xdg-open http://localhost:8000/api/docs || echo "Open http://localhost:8000/api/docs"

flower: ## Open Flower UI in browser
	@echo "Opening Flower..."
	@open http://localhost:5555 || xdg-open http://localhost:5555 || echo "Open http://localhost:5555"

# Full setup from scratch
init: ## Complete initialization (setup + start + migrate + webhooks)
	@echo "🚀 Initializing Мармеладный Дворик..."
	@make setup
	@echo ""
	@read -p "Press Enter after editing .env with your tokens..."
	@make start
	@echo ""
	@echo "⏳ Waiting for services to be ready..."
	@sleep 30
	@make migrate
	@echo ""
	@make webhooks
	@echo ""
	@echo "✅ Initialization complete!"
	@echo ""
	@echo "📚 Next steps:"
	@echo "  - API Docs: http://localhost:8000/api/docs"
	@echo "  - Health: http://localhost:8000/health"
	@echo "  - Flower: http://localhost:5555"
	@echo ""

