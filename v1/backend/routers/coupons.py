from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

import crud, models, schemas
from database import SessionLocal

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/coupons/", response_model=schemas.Coupon)
def create_coupon(coupon: schemas.CouponCreate, db: Session = Depends(get_db)):
    return crud.create_coupon(db=db, coupon=coupon)


@router.get("/coupons/", response_model=List[schemas.Coupon])
def read_coupons(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    coupons = crud.get_coupons(db, skip=skip, limit=limit)
    return coupons


@router.get("/coupons/{coupon_id}", response_model=schemas.Coupon)
def read_coupon(coupon_id: int, db: Session = Depends(get_db)):
    db_coupon = crud.get_coupon(db, coupon_id=coupon_id)
    if db_coupon is None:
        raise HTTPException(status_code=404, detail="Coupon not found")
    return db_coupon
