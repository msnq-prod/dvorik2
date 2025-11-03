"""API endpoint tests."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_root_endpoint(client: AsyncClient):
    """Test root endpoint."""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "running"
    assert "version" in data


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    """Test health check endpoint."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_api_docs(client: AsyncClient):
    """Test API documentation."""
    response = await client.get("/api/docs")
    assert response.status_code == 200


# Add more tests here
# Example test structure:

# @pytest.mark.asyncio
# async def test_create_user(client: AsyncClient, test_user_data):
#     """Test user creation."""
#     response = await client.post("/api/v1/users", json=test_user_data)
#     assert response.status_code == 201
#     data = response.json()
#     assert data["telegram_id"] == test_user_data["telegram_id"]

