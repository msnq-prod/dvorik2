from fastapi import FastAPI
import models
from database import engine
from routers import users, coupons, campaigns, database

models.Base.metadata.create_all(bind=engine)

app = FastAPI()


app.include_router(users.router, prefix="/api", tags=["users"])
app.include_router(coupons.router, prefix="/api", tags=["coupons"])
app.include_router(campaigns.router, prefix="/api", tags=["campaigns"])
app.include_router(database.router, prefix="/api", tags=["database"])


@app.get("/")
def read_root():
    return {"message": "Welcome to the API"}
