from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import inspect
from sqlalchemy.orm import Session
from ..database import engine, SessionLocal, Base

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/database/schema")
def get_database_schema(db: Session = Depends(get_db)):
    inspector = inspect(engine)
    schema = {}
    for table_name in inspector.get_table_names():
        columns = []
        for column in inspector.get_columns(table_name):
            columns.append({
                "name": column['name'],
                "type": str(column['type']),
                "nullable": column['nullable'],
                "default": column['default'],
            })
        schema[table_name] = columns
    return schema

@router.get("/database/{table_name}")
def get_table_data(table_name: str, db: Session = Depends(get_db)):
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        raise HTTPException(status_code=404, detail="Table not found")

    table = Base.metadata.tables[table_name]
    data = db.query(table).all()
    return data

@router.post("/database/{table_name}")
def create_table_row(table_name: str, data: dict, db: Session = Depends(get_db)):
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        raise HTTPException(status_code=404, detail="Table not found")

    table = Base.metadata.tables[table_name]
    new_row = table.insert().values(**data)
    db.execute(new_row)
    db.commit()
    return {"message": "Row created successfully"}

@router.put("/database/{table_name}/{row_id}")
def update_table_row(table_name: str, row_id: int, data: dict, db: Session = Depends(get_db)):
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        raise HTTPException(status_code=404, detail="Table not found")

    table = Base.metadata.tables[table_name]
    updated_row = table.update().where(table.c.id == row_id).values(**data)
    db.execute(updated_row)
    db.commit()
    return {"message": "Row updated successfully"}

@router.delete("/database/{table_name}/{row_id}")
def delete_table_row(table_name: str, row_id: int, db: Session = Depends(get_db)):
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        raise HTTPException(status_code=404, detail="Table not found")

    table = Base.metadata.tables[table_name]
    deleted_row = table.delete().where(table.c.id == row_id)
    db.execute(deleted_row)
    db.commit()
    return {"message": "Row deleted successfully"}
