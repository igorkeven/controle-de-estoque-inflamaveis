from __future__ import annotations

from datetime import date
from enum import Enum
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Date, Float, ForeignKey, String, case, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite:///{(DATA_DIR / 'estoque.db').as_posix()}"
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


class MovementType(str, Enum):
    ENTRADA = "ENTRADA"
    SAIDA_USO = "SAIDA_USO"
    SAIDA_DESCARTE = "SAIDA_DESCARTE"


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(20))
    unit: Mapped[str] = mapped_column(String(10))
    minimum_stock: Mapped[float] = mapped_column(Float, default=0)
    storage_location: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    lots: Mapped[list[Lot]] = relationship(back_populates="product", cascade="all, delete-orphan")


class Lot(Base):
    __tablename__ = "lots"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    code: Mapped[str] = mapped_column(String(40), index=True)
    manufacture_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date] = mapped_column(Date, index=True)
    supplier: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    product: Mapped[Product] = relationship(back_populates="lots")
    movements: Mapped[list[Movement]] = relationship(back_populates="lot", cascade="all, delete-orphan")


class Movement(Base):
    __tablename__ = "movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    lot_id: Mapped[int] = mapped_column(ForeignKey("lots.id"), index=True)
    type: Mapped[str] = mapped_column(String(20), index=True)
    movement_date: Mapped[date] = mapped_column(Date, index=True)
    quantity: Mapped[float] = mapped_column(Float)
    responsible: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    destination_reason: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    lot: Mapped[Lot] = relationship(back_populates="movements")


class ProductCreate(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=2, max_length=120)
    category: str
    unit: str
    minimum_stock: float = 0
    storage_location: Optional[str] = None
    notes: Optional[str] = None


class ProductRead(ProductCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class LotCreate(BaseModel):
    product_id: int
    code: str = Field(min_length=1, max_length=40)
    manufacture_date: Optional[date] = None
    expiry_date: date
    supplier: Optional[str] = None
    notes: Optional[str] = None


class LotRead(LotCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    product_name: str
    product_code: str


class MovementCreate(BaseModel):
    lot_id: int
    type: MovementType
    movement_date: date
    quantity: float = Field(gt=0)
    responsible: Optional[str] = None
    destination_reason: Optional[str] = None
    notes: Optional[str] = None


class MovementRead(MovementCreate):
    id: int
    product_name: str
    lot_code: str


class StockRow(BaseModel):
    lot_id: int
    lot_code: str
    product_id: int
    product_code: str
    product_name: str
    category: str
    unit: str
    expiry_date: date
    days_to_expiry: int
    expiry_status: str
    current_stock: float
    minimum_stock: float
    below_minimum: bool


class Dashboard(BaseModel):
    total_products: int
    total_lots: int
    total_units: float
    expired: int
    expiring_30: int
    expiring_60: int
    below_minimum: int


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def stock_snapshot(db: Session) -> list[StockRow]:
    saldo_expr = func.coalesce(
        func.sum(
            case(
                (Movement.type == MovementType.ENTRADA.value, Movement.quantity),
                else_=-Movement.quantity,
            )
        ),
        0,
    )

    rows = db.execute(
        select(
            Lot.id,
            Lot.code,
            Product.id,
            Product.code,
            Product.name,
            Product.category,
            Product.unit,
            Lot.expiry_date,
            Product.minimum_stock,
            saldo_expr.label("current_stock"),
        )
        .join(Product, Product.id == Lot.product_id)
        .outerjoin(Movement, Movement.lot_id == Lot.id)
        .group_by(Lot.id, Product.id)
        .order_by(Lot.expiry_date.asc())
    ).all()

    today = date.today()
    out: list[StockRow] = []
    for r in rows:
        days = (r.expiry_date - today).days
        if days < 0:
            status = "VENCIDO"
        elif days <= 30:
            status = "VENCE EM <= 30 DIAS"
        elif days <= 60:
            status = "ATENCAO (31-60 DIAS)"
        else:
            status = "OK"

        current_stock = float(r.current_stock or 0)
        minimum = float(r.minimum_stock or 0)
        out.append(
            StockRow(
                lot_id=r.id,
                lot_code=r.code,
                product_id=r[2],
                product_code=r[3],
                product_name=r[4],
                category=r[5],
                unit=r[6],
                expiry_date=r[7],
                days_to_expiry=days,
                expiry_status=status,
                current_stock=round(current_stock, 2),
                minimum_stock=round(minimum, 2),
                below_minimum=current_stock <= minimum,
            )
        )
    return out


app = FastAPI(title="Controle de Estoque - Tintas e Inflamaveis")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/products", response_model=list[ProductRead])
def list_products(db: Session = Depends(get_db)) -> list[Product]:
    return db.scalars(select(Product).order_by(Product.name.asc())).all()


@app.post("/api/products", response_model=ProductRead)
def create_product(payload: ProductCreate, db: Session = Depends(get_db)) -> Product:
    exists = db.scalar(select(Product).where(Product.code == payload.code.strip().upper()))
    if exists:
        raise HTTPException(status_code=400, detail="Codigo de produto ja cadastrado")

    product = Product(
        code=payload.code.strip().upper(),
        name=payload.name.strip(),
        category=payload.category.strip().upper(),
        unit=payload.unit.strip().upper(),
        minimum_stock=payload.minimum_stock,
        storage_location=(payload.storage_location or "").strip() or None,
        notes=(payload.notes or "").strip() or None,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@app.get("/api/lots", response_model=list[LotRead])
def list_lots(db: Session = Depends(get_db)) -> list[LotRead]:
    rows = db.execute(
        select(Lot, Product.name, Product.code)
        .join(Product, Product.id == Lot.product_id)
        .order_by(Lot.expiry_date.asc())
    ).all()

    return [
        LotRead(
            id=lot.id,
            product_id=lot.product_id,
            code=lot.code,
            manufacture_date=lot.manufacture_date,
            expiry_date=lot.expiry_date,
            supplier=lot.supplier,
            notes=lot.notes,
            product_name=product_name,
            product_code=product_code,
        )
        for lot, product_name, product_code in rows
    ]


@app.post("/api/lots", response_model=LotRead)
def create_lot(payload: LotCreate, db: Session = Depends(get_db)) -> LotRead:
    product = db.get(Product, payload.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto nao encontrado")

    code = payload.code.strip().upper()
    duplicate = db.scalar(
        select(Lot).where(Lot.product_id == payload.product_id, Lot.code == code)
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="Lote ja existe para este produto")

    lot = Lot(
        product_id=payload.product_id,
        code=code,
        manufacture_date=payload.manufacture_date,
        expiry_date=payload.expiry_date,
        supplier=(payload.supplier or "").strip() or None,
        notes=(payload.notes or "").strip() or None,
    )
    db.add(lot)
    db.commit()
    db.refresh(lot)

    return LotRead(
        id=lot.id,
        product_id=lot.product_id,
        code=lot.code,
        manufacture_date=lot.manufacture_date,
        expiry_date=lot.expiry_date,
        supplier=lot.supplier,
        notes=lot.notes,
        product_name=product.name,
        product_code=product.code,
    )


@app.get("/api/movements", response_model=list[MovementRead])
def list_movements(db: Session = Depends(get_db)) -> list[MovementRead]:
    rows = db.execute(
        select(Movement, Product.name, Lot.code)
        .join(Lot, Lot.id == Movement.lot_id)
        .join(Product, Product.id == Lot.product_id)
        .order_by(Movement.movement_date.desc(), Movement.id.desc())
    ).all()

    return [
        MovementRead(
            id=mov.id,
            lot_id=mov.lot_id,
            type=mov.type,
            movement_date=mov.movement_date,
            quantity=mov.quantity,
            responsible=mov.responsible,
            destination_reason=mov.destination_reason,
            notes=mov.notes,
            product_name=product_name,
            lot_code=lot_code,
        )
        for mov, product_name, lot_code in rows
    ]


@app.post("/api/movements", response_model=MovementRead)
def create_movement(payload: MovementCreate, db: Session = Depends(get_db)) -> MovementRead:
    lot = db.get(Lot, payload.lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Lote nao encontrado")

    if payload.type != MovementType.ENTRADA:
        snapshot = {row.lot_id: row.current_stock for row in stock_snapshot(db)}
        current = snapshot.get(payload.lot_id, 0)
        if payload.quantity > current:
            raise HTTPException(status_code=400, detail="Saldo insuficiente para essa saida")

    movement = Movement(
        lot_id=payload.lot_id,
        type=payload.type.value,
        movement_date=payload.movement_date,
        quantity=payload.quantity,
        responsible=(payload.responsible or "").strip() or None,
        destination_reason=(payload.destination_reason or "").strip() or None,
        notes=(payload.notes or "").strip() or None,
    )

    db.add(movement)
    db.commit()
    db.refresh(movement)

    product_name = db.scalar(
        select(Product.name).join(Lot, Lot.product_id == Product.id).where(Lot.id == movement.lot_id)
    )
    return MovementRead(
        id=movement.id,
        lot_id=movement.lot_id,
        type=movement.type,
        movement_date=movement.movement_date,
        quantity=movement.quantity,
        responsible=movement.responsible,
        destination_reason=movement.destination_reason,
        notes=movement.notes,
        product_name=product_name or "",
        lot_code=lot.code,
    )


@app.get("/api/stock", response_model=list[StockRow])
def get_stock(db: Session = Depends(get_db)) -> list[StockRow]:
    return stock_snapshot(db)


@app.get("/api/dashboard", response_model=Dashboard)
def get_dashboard(db: Session = Depends(get_db)) -> Dashboard:
    stock = stock_snapshot(db)
    return Dashboard(
        total_products=db.scalar(select(func.count(Product.id))) or 0,
        total_lots=len(stock),
        total_units=round(sum(max(0, row.current_stock) for row in stock), 2),
        expired=sum(1 for row in stock if row.expiry_status == "VENCIDO"),
        expiring_30=sum(1 for row in stock if row.expiry_status == "VENCE EM <= 30 DIAS"),
        expiring_60=sum(1 for row in stock if row.expiry_status == "ATENCAO (31-60 DIAS)"),
        below_minimum=sum(1 for row in stock if row.below_minimum),
    )


@app.get("/")
def serve_home() -> FileResponse:
    index_file = FRONTEND_DIST / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=503, detail="Frontend nao compilado")
    return FileResponse(index_file)


@app.get("/{full_path:path}")
def serve_spa(full_path: str) -> FileResponse:
    if full_path.startswith("api"):
        raise HTTPException(status_code=404, detail="Rota nao encontrada")

    index_file = FRONTEND_DIST / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=503, detail="Frontend nao compilado")
    return FileResponse(index_file)
