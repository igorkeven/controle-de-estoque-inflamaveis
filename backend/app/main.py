from __future__ import annotations

from datetime import date, datetime
from email.message import EmailMessage
from enum import Enum
import hashlib
import os
from pathlib import Path
import secrets
import smtplib
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Boolean, Date, Float, ForeignKey, Integer, String, case, create_engine, func, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

BASE_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BASE_DIR.parent
DATA_DIR = Path(os.getenv("ESTOQUE_DATA_DIR", str(BASE_DIR / "data"))).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite:///{(DATA_DIR / 'estoque.db').as_posix()}"
FRONTEND_DIST = Path(
    os.getenv("ESTOQUE_FRONTEND_DIST", str(PROJECT_ROOT / "frontend" / "dist"))
).resolve()

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


class MovementType(str, Enum):
    ENTRADA = "ENTRADA"
    SAIDA_USO = "SAIDA_USO"
    SAIDA_DESCARTE = "SAIDA_DESCARTE"


class UserRole(str, Enum):
    ALMOXARIFE = "ALMOXARIFE"
    AREA_TECNICA = "AREA_TECNICA"


class SupplierType(str, Enum):
    WEG = "WEG"
    EXTERNO = "EXTERNO"


class ShiftType(str, Enum):
    PRIMEIRO = "PRIMEIRO TURNO"
    SEGUNDO = "SEGUNDO TURNO"
    TERCEIRO = "TERCEIRO TURNO"


class PersonType(str, Enum):
    RESPONSAVEL = "RESPONSAVEL"
    ALMOXARIFE = "ALMOXARIFE"


class ReasonType(str, Enum):
    ENTRADA = "ENTRADA"
    SAIDA = "SAIDA"


class TankCorrectionType(str, Enum):
    NENHUMA = "NENHUMA"
    SOLVENTE = "SOLVENTE"
    TINTA = "TINTA"
    NIVEL = "NIVEL"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(64))
    role: Mapped[str] = mapped_column(String(20), index=True)
    active: Mapped[bool] = mapped_column(default=True)


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


class Person(Base):
    __tablename__ = "people"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    type: Mapped[str] = mapped_column(String(20), index=True)
    active: Mapped[bool] = mapped_column(default=True)
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class MovementReason(Base):
    __tablename__ = "movement_reasons"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    type: Mapped[str] = mapped_column(String(20), index=True)
    active: Mapped[bool] = mapped_column(default=True)
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class TankAnalysis(Base):
    __tablename__ = "tank_analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    analysis_date: Mapped[date] = mapped_column(Date, index=True)
    analysis_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    viscosity_seconds: Mapped[float] = mapped_column(Float)
    corrected_viscosity_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    solvent_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    paint_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    level_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    responsible: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class SolidContentAnalysis(Base):
    __tablename__ = "solid_content_analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    analysis_date: Mapped[date] = mapped_column(Date, index=True)
    analysis_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    capsule1_empty_weight: Mapped[float] = mapped_column(Float)
    capsule1_wet_weight: Mapped[float] = mapped_column(Float)
    capsule1_dry_weight: Mapped[float] = mapped_column(Float)
    capsule2_empty_weight: Mapped[float] = mapped_column(Float)
    capsule2_wet_weight: Mapped[float] = mapped_column(Float)
    capsule2_dry_weight: Mapped[float] = mapped_column(Float)
    capsule3_empty_weight: Mapped[float] = mapped_column(Float)
    capsule3_wet_weight: Mapped[float] = mapped_column(Float)
    capsule3_dry_weight: Mapped[float] = mapped_column(Float)
    average_percentage: Mapped[float] = mapped_column(Float)
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    responsible: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class Lot(Base):
    __tablename__ = "lots"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    code: Mapped[str] = mapped_column(String(40), index=True)
    manufacture_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    purchase_quantity: Mapped[float] = mapped_column(Float, default=0)
    supplier: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    supplier_type: Mapped[str] = mapped_column(String(20), default=SupplierType.WEG.value)
    external_supplier: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    product: Mapped[Product] = relationship(back_populates="lots")
    movements: Mapped[list[Movement]] = relationship(back_populates="lot", cascade="all, delete-orphan")


class Movement(Base):
    __tablename__ = "movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    lot_id: Mapped[int] = mapped_column(ForeignKey("lots.id"), index=True)
    type: Mapped[str] = mapped_column(String(20), index=True)
    movement_date: Mapped[date] = mapped_column(Date, index=True)
    movement_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    shift: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    is_overtime: Mapped[bool] = mapped_column(default=False)
    quantity: Mapped[float] = mapped_column(Float)
    responsible: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    destination_reason: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    lot: Mapped[Lot] = relationship(back_populates="movements")


class EmailSettings(Base):
    __tablename__ = "email_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    viscosity_alert_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    expiry_alert_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    expiry_days: Mapped[int] = mapped_column(Integer, default=30)
    smtp_host: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    smtp_port: Mapped[int] = mapped_column(Integer, default=587)
    smtp_username: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    smtp_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    use_tls: Mapped[bool] = mapped_column(Boolean, default=True)
    sender_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    sender_email: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class EmailRecipient(Base):
    __tablename__ = "email_recipients"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class AlertLog(Base):
    __tablename__ = "alert_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    alert_key: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    alert_type: Mapped[str] = mapped_column(String(40), index=True)
    created_at: Mapped[str] = mapped_column(String(40))


class SessionToken(Base):
    __tablename__ = "session_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    device_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[str] = mapped_column(String(40))
    last_used_at: Mapped[str] = mapped_column(String(40))


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


class LoginPayload(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=3, max_length=120)


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=3, max_length=120)
    role: UserRole
    active: bool = True


class UserUpdate(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    full_name: str = Field(min_length=2, max_length=120)
    password: Optional[str] = Field(default=None, min_length=3, max_length=120)
    role: UserRole
    active: bool = True


class UserRead(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    active: bool


class LoginResponse(BaseModel):
    token: str
    user: UserRead


class EmailSettingsUpdate(BaseModel):
    enabled: bool = False
    viscosity_alert_enabled: bool = True
    expiry_alert_enabled: bool = True
    expiry_days: int = Field(default=30, ge=1, le=365)
    smtp_host: Optional[str] = None
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = Field(default=None, max_length=255)
    use_tls: bool = True
    sender_name: Optional[str] = None
    sender_email: Optional[str] = None


class EmailSettingsRead(BaseModel):
    enabled: bool
    viscosity_alert_enabled: bool
    expiry_alert_enabled: bool
    expiry_days: int
    smtp_host: Optional[str]
    smtp_port: int
    smtp_username: Optional[str]
    use_tls: bool
    sender_name: Optional[str]
    sender_email: Optional[str]
    has_password: bool


class EmailRecipientCreate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    email: str = Field(min_length=5, max_length=120)
    active: bool = True
    notes: Optional[str] = None


class EmailRecipientRead(EmailRecipientCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class EmailDraft(BaseModel):
    recipients: list[str]
    subject: str
    body: str
    alert_key: Optional[str] = None


class PersonCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    type: PersonType
    active: bool = True
    notes: Optional[str] = None


class PersonRead(PersonCreate):
    id: int


class ReasonCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    type: ReasonType
    active: bool = True
    notes: Optional[str] = None


class ReasonRead(ReasonCreate):
    id: int


class TankAnalysisCreate(BaseModel):
    analysis_date: date
    analysis_time: Optional[str] = None
    viscosity_seconds: float = Field(gt=0)
    corrected_viscosity_seconds: Optional[float] = Field(default=None, gt=0)
    solvent_amount: Optional[float] = Field(default=None, ge=0)
    paint_amount: Optional[float] = Field(default=None, ge=0)
    level_amount: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = None
    responsible: Optional[str] = None


class TankAnalysisRead(TankAnalysisCreate):
    id: int
    in_target_range: bool


class SolidCapsuleInput(BaseModel):
    empty_weight: float = Field(gt=0)
    wet_weight: float = Field(gt=0)
    dry_weight: float = Field(gt=0)


class SolidContentAnalysisCreate(BaseModel):
    analysis_date: date
    analysis_time: Optional[str] = None
    capsule1: SolidCapsuleInput
    capsule2: SolidCapsuleInput
    capsule3: SolidCapsuleInput
    notes: Optional[str] = None
    responsible: Optional[str] = None


class SolidContentAnalysisRead(BaseModel):
    id: int
    analysis_date: date
    analysis_time: Optional[str] = None
    capsule1_percentage: float
    capsule2_percentage: float
    capsule3_percentage: float
    average_percentage: float
    notes: Optional[str] = None
    responsible: Optional[str] = None
    in_target_range: bool


class LotCreate(BaseModel):
    product_id: int
    code: str = Field(min_length=1, max_length=40)
    manufacture_date: Optional[date] = None
    expiry_date: Optional[date] = None
    purchase_quantity: float = Field(gt=0)
    supplier_type: SupplierType = SupplierType.WEG
    external_supplier: Optional[str] = None
    notes: Optional[str] = None


class PurchaseItemCreate(BaseModel):
    product_id: int
    purchase_quantity: float = Field(gt=0)
    notes: Optional[str] = None


class PurchaseBatchCreate(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    supplier_type: SupplierType = SupplierType.WEG
    external_supplier: Optional[str] = None
    items: list[PurchaseItemCreate] = Field(min_length=1)


class LotRead(LotCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    product_name: str
    product_code: str
    received_quantity: float = 0
    remaining_quantity: float = 0


class MovementCreate(BaseModel):
    lot_id: Optional[int] = None
    product_id: Optional[int] = None
    type: MovementType
    movement_date: date
    movement_time: Optional[str] = None
    shift: Optional[ShiftType] = None
    is_overtime: bool = False
    quantity: float = Field(gt=0)
    manufacture_date: Optional[date] = None
    expiry_date: Optional[date] = None
    responsible: Optional[str] = None
    destination_reason: Optional[str] = None
    notes: Optional[str] = None


class MovementRead(MovementCreate):
    id: int
    product_name: str
    product_code: str
    lot_code: str


class StockRow(BaseModel):
    lot_id: int
    lot_code: str
    product_id: int
    product_code: str
    product_name: str
    category: str
    unit: str
    expiry_date: Optional[date]
    days_to_expiry: Optional[int]
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


sessions: dict[str, int] = {}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def normalize_code(value: str) -> str:
    return value.strip().upper()


def normalize_optional_text(value: str | None) -> str | None:
    return (value or "").strip() or None


def infer_shift(movement_time: str | None) -> ShiftType | None:
    if not movement_time:
        return None

    try:
        hour, minute = [int(part) for part in movement_time.split(":", 1)]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Hora da movimentacao invalida") from exc

    total_minutes = hour * 60 + minute
    first_shift_end = 14 * 60 + 18
    second_shift_end = 23 * 60

    if 5 * 60 <= total_minutes < first_shift_end:
        return ShiftType.PRIMEIRO
    if first_shift_end <= total_minutes < second_shift_end:
        return ShiftType.SEGUNDO
    return ShiftType.TERCEIRO


def hash_password(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def serialize_user(user: User) -> UserRead:
    return UserRead(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        active=user.active,
    )


def persist_session_token(db: Session, token: str, user_id: int, device_id: str | None) -> None:
    db.add(
        SessionToken(
            token=token,
            user_id=user_id,
            device_id=normalize_optional_text(device_id),
            active=True,
            created_at=datetime.now().isoformat(timespec="seconds"),
            last_used_at=datetime.now().isoformat(timespec="seconds"),
        )
    )
    db.commit()


def resolve_session_user_id(db: Session, token: str, device_id: str | None) -> int | None:
    cached = sessions.get(token)
    if cached:
        return cached

    session_row = db.scalar(
        select(SessionToken).where(SessionToken.token == token, SessionToken.active.is_(True))
    )
    if not session_row:
        return None
    if session_row.device_id and normalize_optional_text(device_id) != session_row.device_id:
        return None

    session_row.last_used_at = datetime.now().isoformat(timespec="seconds")
    db.commit()
    sessions[token] = session_row.user_id
    return session_row.user_id


def get_current_user(
    authorization: str | None = Header(default=None),
    x_device_id: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sessao nao autenticada")

    token = authorization.removeprefix("Bearer ").strip()
    user_id = resolve_session_user_id(db, token, x_device_id)
    if not user_id:
        raise HTTPException(status_code=401, detail="Sessao invalida ou expirada")

    user = db.get(User, user_id)
    if not user or not user.active:
        sessions.pop(token, None)
        raise HTTPException(status_code=401, detail="Usuario indisponivel")
    return user


def require_roles(*roles: UserRole):
    allowed = {role.value for role in roles}

    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=403, detail="Usuario sem permissao para esta operacao")
        return user

    return dependency


def ensure_default_users(db: Session) -> None:
    defaults = [
        {
            "username": "almoxarife",
            "full_name": "Almoxarife",
            "password": "almox123",
            "role": UserRole.ALMOXARIFE.value,
        },
        {
            "username": "tecnico",
            "full_name": "Area Tecnica",
            "password": "tecnica123",
            "role": UserRole.AREA_TECNICA.value,
        },
    ]

    changed = False
    for item in defaults:
        existing = db.scalar(select(User).where(User.username == item["username"]))
        if existing:
            continue
        db.add(
            User(
                username=item["username"],
                full_name=item["full_name"],
                password_hash=hash_password(item["password"]),
                role=item["role"],
                active=True,
            )
        )
        changed = True

    if changed:
        db.commit()


def ensure_default_people(db: Session) -> None:
    defaults = [
        {"name": "ALMOXARIFE DE INFLAMAVEIS", "type": PersonType.ALMOXARIFE.value},
    ]

    changed = False
    for item in defaults:
        existing = db.scalar(select(Person).where(func.upper(Person.name) == item["name"]))
        if existing:
            continue
        db.add(
            Person(
                name=item["name"],
                type=item["type"],
                active=True,
                notes=None,
            )
        )
        changed = True

    if changed:
        db.commit()


def ensure_default_reasons(db: Session) -> None:
    defaults = [
        {"name": "RECEBIMENTO DE COMPRA", "type": ReasonType.ENTRADA.value},
        {"name": "USO NA OPERACAO", "type": ReasonType.SAIDA.value},
        {"name": "DESCARTE", "type": ReasonType.SAIDA.value},
    ]

    changed = False
    for item in defaults:
        existing = db.scalar(
            select(MovementReason).where(func.upper(MovementReason.name) == item["name"])
        )
        if existing:
            continue
        db.add(
            MovementReason(
                name=item["name"],
                type=item["type"],
                active=True,
                notes=None,
            )
        )
        changed = True

    if changed:
        db.commit()


def get_or_create_email_settings(db: Session) -> EmailSettings:
    settings = db.scalar(select(EmailSettings).limit(1))
    if settings:
        return settings

    settings = EmailSettings()
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def serialize_email_settings(settings: EmailSettings) -> EmailSettingsRead:
    return EmailSettingsRead(
        enabled=settings.enabled,
        viscosity_alert_enabled=settings.viscosity_alert_enabled,
        expiry_alert_enabled=settings.expiry_alert_enabled,
        expiry_days=settings.expiry_days,
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        smtp_username=settings.smtp_username,
        use_tls=settings.use_tls,
        sender_name=settings.sender_name,
        sender_email=settings.sender_email,
        has_password=bool(settings.smtp_password),
    )


def normalize_email(value: str) -> str:
    return value.strip().lower()


def list_active_recipient_emails(db: Session) -> list[str]:
    rows = db.scalars(
        select(EmailRecipient).where(EmailRecipient.active.is_(True)).order_by(EmailRecipient.email.asc())
    ).all()
    return [row.email for row in rows]


def can_send_email(settings: EmailSettings, recipients: list[str]) -> bool:
    return bool(
        settings.enabled
        and settings.smtp_host
        and settings.sender_email
        and recipients
    )


def send_email_message(
    settings: EmailSettings,
    recipients: list[str],
    subject: str,
    body: str,
) -> bool:
    if not can_send_email(settings, recipients):
        return False

    message = EmailMessage()
    sender_email = settings.sender_email or settings.smtp_username or ""
    sender_name = normalize_optional_text(settings.sender_name)
    message["Subject"] = subject
    message["From"] = f"{sender_name} <{sender_email}>" if sender_name else sender_email
    message["To"] = ", ".join(recipients)
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
            server.ehlo()
            if settings.use_tls:
                server.starttls()
                server.ehlo()
            if settings.smtp_username and settings.smtp_password:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
        return True
    except Exception as exc:  # pragma: no cover
        print(f"Falha ao enviar e-mail: {exc}")
        return False


def has_alert_log(db: Session, alert_key: str) -> bool:
    return bool(db.scalar(select(AlertLog.id).where(AlertLog.alert_key == alert_key)))


def create_alert_log(db: Session, alert_key: str, alert_type: str) -> None:
    db.add(
        AlertLog(
            alert_key=alert_key,
            alert_type=alert_type,
            created_at=datetime.now().isoformat(timespec="seconds"),
        )
    )
    db.commit()


def send_expiry_alert_if_needed(db: Session) -> None:
    settings = get_or_create_email_settings(db)
    if not (settings.enabled and settings.expiry_alert_enabled):
        return

    today_key = f"expiry-summary:{date.today().isoformat()}"
    if has_alert_log(db, today_key):
        return

    recipients = list_active_recipient_emails(db)
    if not recipients:
        return

    items = [
        row
        for row in stock_snapshot(db)
        if row.current_stock > 0
        if row.expiry_date is not None
        and row.days_to_expiry is not None
        and row.days_to_expiry <= settings.expiry_days
    ]
    if not items:
        return

    body_lines = [
        "Alerta automatico de validades do estoque.",
        "",
        f"Itens dentro do limite de {settings.expiry_days} dias: {len(items)}",
        "",
    ]
    for item in items:
        validade = item.expiry_date.isoformat() if item.expiry_date else "-"
        body_lines.append(
            f"- {item.product_code} | {item.product_name} | Nota {item.lot_code} | "
            f"Validade {validade} | Status {item.expiry_status} | Saldo {item.current_stock}"
        )

    sent = send_email_message(
        settings,
        recipients,
        subject=f"Alerta de validade - {len(items)} item(ns) em atencao",
        body="\n".join(body_lines),
    )
    if sent:
        create_alert_log(db, today_key, "EXPIRY")


def send_tank_alert_if_needed(db: Session, analysis: TankAnalysis) -> None:
    settings = get_or_create_email_settings(db)
    if not (settings.enabled and settings.viscosity_alert_enabled):
        return

    if 48 <= analysis.viscosity_seconds <= 52:
        return

    recipients = list_active_recipient_emails(db)
    if not recipients:
        return

    corrected_status = "Nao informada"
    if analysis.corrected_viscosity_seconds is not None:
        corrected_status = (
            "Dentro da faixa"
            if 48 <= analysis.corrected_viscosity_seconds <= 52
            else "Ainda fora da faixa"
        )

    body = "\n".join(
        [
            "Alerta de viscosidade fora da faixa.",
            "",
            f"Data: {analysis.analysis_date.isoformat()}",
            f"Hora: {analysis.analysis_time or '-'}",
            f"Responsavel: {analysis.responsible or '-'}",
            f"Viscosidade inicial: {analysis.viscosity_seconds:.2f}s",
            f"Solvente adicionado: {analysis.solvent_amount or 0}",
            f"Tinta adicionada: {analysis.paint_amount or 0}",
            (
                f"Viscosidade apos correcao: {analysis.corrected_viscosity_seconds:.2f}s"
                if analysis.corrected_viscosity_seconds is not None
                else "Viscosidade apos correcao: -"
            ),
            f"Status apos correcao: {corrected_status}",
            f"Observacoes: {analysis.notes or '-'}",
        ]
    )

    send_email_message(
        settings,
        recipients,
        subject=f"Viscosidade fora da faixa - {analysis.analysis_date.isoformat()} {analysis.analysis_time or ''}".strip(),
        body=body,
    )


def build_expiry_email_draft(db: Session) -> EmailDraft | None:
    settings = get_or_create_email_settings(db)
    if not (settings.enabled and settings.expiry_alert_enabled):
        return None

    recipients = list_active_recipient_emails(db)
    if not recipients:
        return None

    items = [
        row
        for row in stock_snapshot(db)
        if row.current_stock > 0
        if row.expiry_date is not None
        and row.days_to_expiry is not None
        and row.days_to_expiry <= settings.expiry_days
    ]
    if not items:
        return None

    subject = f"Alerta de validade - {len(items)} item(ns) em atencao"
    body_lines = [
        "Alerta automatico de validades do estoque.",
        "",
        f"Itens dentro do limite de {settings.expiry_days} dias: {len(items)}",
        "",
    ]
    for item in items:
        validade = item.expiry_date.isoformat() if item.expiry_date else "-"
        body_lines.append(
            f"- {item.product_code} | {item.product_name} | Nota {item.lot_code} | "
            f"Validade {validade} | Status {item.expiry_status} | Saldo {item.current_stock}"
        )

    return EmailDraft(
        recipients=recipients,
        subject=subject,
        body="\n".join(body_lines),
        alert_key=f"expiry-summary:{date.today().isoformat()}",
    )


def build_tank_email_draft(db: Session, analysis: TankAnalysis) -> EmailDraft | None:
    settings = get_or_create_email_settings(db)
    if not (settings.enabled and settings.viscosity_alert_enabled):
        return None
    if 48 <= analysis.viscosity_seconds <= 52:
        return None

    recipients = list_active_recipient_emails(db)
    if not recipients:
        return None

    corrected_status = "Nao informada"
    if analysis.corrected_viscosity_seconds is not None:
        corrected_status = (
            "Dentro da faixa"
            if 48 <= analysis.corrected_viscosity_seconds <= 52
            else "Ainda fora da faixa"
        )

    body = "\n".join(
        [
            "Alerta de viscosidade fora da faixa.",
            "",
            f"Data: {analysis.analysis_date.isoformat()}",
            f"Hora: {analysis.analysis_time or '-'}",
            f"Responsavel: {analysis.responsible or '-'}",
            f"Viscosidade inicial: {analysis.viscosity_seconds:.2f}s",
            f"Solvente adicionado: {analysis.solvent_amount or 0}",
            f"Tinta adicionada: {analysis.paint_amount or 0}",
            (
                f"Viscosidade apos correcao: {analysis.corrected_viscosity_seconds:.2f}s"
                if analysis.corrected_viscosity_seconds is not None
                else "Viscosidade apos correcao: -"
            ),
            f"Status apos correcao: {corrected_status}",
            f"Observacoes: {analysis.notes or '-'}",
        ]
    )

    return EmailDraft(
        recipients=recipients,
        subject=f"Viscosidade fora da faixa - {analysis.analysis_date.isoformat()} {analysis.analysis_time or ''}".strip(),
        body=body,
        alert_key=f"tank-analysis:{analysis.id}",
    )


def active_technical_users_count(db: Session, exclude_user_id: int | None = None) -> int:
    stmt = select(func.count(User.id)).where(
        User.role == UserRole.AREA_TECNICA.value,
        User.active.is_(True),
    )
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)
    return int(db.scalar(stmt) or 0)


def ensure_database_columns() -> None:
    with engine.begin() as conn:
        lot_columns = {
            row[1]: row
            for row in conn.execute(text("PRAGMA table_info(lots)")).fetchall()
        }
        if "purchase_quantity" not in lot_columns:
            conn.execute(
                text("ALTER TABLE lots ADD COLUMN purchase_quantity FLOAT DEFAULT 0")
            )
        if "supplier_type" not in lot_columns:
            conn.execute(
                text("ALTER TABLE lots ADD COLUMN supplier_type VARCHAR(20) DEFAULT 'WEG'")
            )
        if "external_supplier" not in lot_columns:
            conn.execute(
                text("ALTER TABLE lots ADD COLUMN external_supplier VARCHAR(120)")
            )
        lot_columns = {
            row[1]: row
            for row in conn.execute(text("PRAGMA table_info(lots)")).fetchall()
        }
        expiry_not_null = bool(lot_columns.get("expiry_date", [None, None, None, 0])[3])
        if expiry_not_null:
            conn.execute(text("PRAGMA foreign_keys=OFF"))
            conn.execute(
                text(
                    """
                    CREATE TABLE lots_new (
                        id INTEGER PRIMARY KEY,
                        product_id INTEGER NOT NULL,
                        code VARCHAR(40) NOT NULL,
                        manufacture_date DATE NULL,
                        expiry_date DATE NULL,
                        purchase_quantity FLOAT DEFAULT 0,
                        supplier VARCHAR(120) NULL,
                        supplier_type VARCHAR(20) DEFAULT 'WEG',
                        external_supplier VARCHAR(120) NULL,
                        notes VARCHAR(255) NULL,
                        FOREIGN KEY(product_id) REFERENCES products (id)
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO lots_new (
                        id, product_id, code, manufacture_date, expiry_date,
                        purchase_quantity, supplier, supplier_type, external_supplier, notes
                    )
                    SELECT
                        id, product_id, code, manufacture_date, expiry_date,
                        COALESCE(purchase_quantity, 0), supplier,
                        COALESCE(supplier_type, 'WEG'), external_supplier, notes
                    FROM lots
                    """
                )
            )
            conn.execute(text("DROP TABLE lots"))
            conn.execute(text("ALTER TABLE lots_new RENAME TO lots"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_lots_product_id ON lots (product_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_lots_code ON lots (code)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_lots_expiry_date ON lots (expiry_date)"))
            conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.execute(
            text(
                "UPDATE lots "
                "SET purchase_quantity = 0 "
                "WHERE purchase_quantity IS NULL"
            )
        )
        conn.execute(
            text(
                "UPDATE lots "
                "SET supplier_type = CASE "
                "WHEN supplier IS NULL OR UPPER(supplier) = 'WEG' THEN 'WEG' "
                "ELSE 'EXTERNO' END "
                "WHERE supplier_type IS NULL"
            )
        )
        conn.execute(
            text(
                "UPDATE lots "
                "SET external_supplier = supplier "
                "WHERE supplier_type = 'EXTERNO' "
                "AND supplier IS NOT NULL "
                "AND external_supplier IS NULL"
            )
        )

        movement_columns = {
            row[1]: row
            for row in conn.execute(text("PRAGMA table_info(movements)")).fetchall()
        }
        if "movement_time" not in movement_columns:
            conn.execute(
                text("ALTER TABLE movements ADD COLUMN movement_time VARCHAR(5)")
            )
        if "shift" not in movement_columns:
            conn.execute(
                text("ALTER TABLE movements ADD COLUMN shift VARCHAR(30)")
            )
        if "is_overtime" not in movement_columns:
            conn.execute(
                text("ALTER TABLE movements ADD COLUMN is_overtime BOOLEAN DEFAULT 0")
            )

        tank_table_exists = conn.execute(
            text(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='tank_analyses'"
            )
        ).first()
        if tank_table_exists:
            tank_columns = {
                row[1]: row
                for row in conn.execute(text("PRAGMA table_info(tank_analyses)")).fetchall()
            }
            needs_rebuild = (
                "correction_type" in tank_columns
                or "correction_amount" in tank_columns
                or "solvent_amount" not in tank_columns
                or "paint_amount" not in tank_columns
                or "level_amount" not in tank_columns
                or "corrected_viscosity_seconds" not in tank_columns
            )
            if needs_rebuild:
                conn.execute(text("PRAGMA foreign_keys=OFF"))
                conn.execute(
                    text(
                        """
                        CREATE TABLE tank_analyses_new (
                            id INTEGER PRIMARY KEY,
                            analysis_date DATE NOT NULL,
                            analysis_time VARCHAR(5) NULL,
                            viscosity_seconds FLOAT NOT NULL,
                            corrected_viscosity_seconds FLOAT NULL,
                            solvent_amount FLOAT NULL,
                            paint_amount FLOAT NULL,
                            level_amount FLOAT NULL,
                            notes VARCHAR(255) NULL,
                            responsible VARCHAR(120) NULL
                        )
                        """
                    )
                )
                correction_type_exists = "correction_type" in tank_columns
                correction_amount_exists = "correction_amount" in tank_columns
                if correction_type_exists and correction_amount_exists:
                    conn.execute(
                        text(
                            """
                            INSERT INTO tank_analyses_new (
                                id, analysis_date, analysis_time, viscosity_seconds,
                                corrected_viscosity_seconds,
                                solvent_amount, paint_amount, level_amount, notes, responsible
                            )
                            SELECT
                                id,
                                analysis_date,
                                analysis_time,
                                viscosity_seconds,
                                NULL,
                                CASE WHEN correction_type = 'SOLVENTE' THEN correction_amount ELSE NULL END,
                                CASE WHEN correction_type = 'TINTA' THEN correction_amount ELSE NULL END,
                                CASE WHEN correction_type = 'NIVEL' THEN correction_amount ELSE NULL END,
                                notes,
                                responsible
                            FROM tank_analyses
                            """
                        )
                    )
                else:
                    corrected_viscosity_select = (
                        "corrected_viscosity_seconds"
                        if "corrected_viscosity_seconds" in tank_columns
                        else "NULL"
                    )
                    solvent_select = (
                        "solvent_amount" if "solvent_amount" in tank_columns else "NULL"
                    )
                    paint_select = (
                        "paint_amount" if "paint_amount" in tank_columns else "NULL"
                    )
                    level_select = (
                        "level_amount" if "level_amount" in tank_columns else "NULL"
                    )
                    conn.execute(
                        text(
                            f"""
                            INSERT INTO tank_analyses_new (
                                id, analysis_date, analysis_time, viscosity_seconds,
                                corrected_viscosity_seconds,
                                solvent_amount, paint_amount, level_amount, notes, responsible
                            )
                            SELECT
                                id, analysis_date, analysis_time, viscosity_seconds,
                                {corrected_viscosity_select}, {solvent_select}, {paint_select}, {level_select}, notes, responsible
                            FROM tank_analyses
                            """
                        )
                    )
                conn.execute(text("DROP TABLE tank_analyses"))
                conn.execute(text("ALTER TABLE tank_analyses_new RENAME TO tank_analyses"))
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_tank_analyses_analysis_date ON tank_analyses (analysis_date)"
                    )
                )
                conn.execute(text("PRAGMA foreign_keys=ON"))


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
        if r.expiry_date is None:
            days = None
            status = "AGUARDANDO RECEBIMENTO"
        else:
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


def lot_received_map(db: Session) -> dict[int, float]:
    rows = db.execute(
        select(
            Movement.lot_id,
            func.coalesce(func.sum(Movement.quantity), 0),
        )
        .where(Movement.type == MovementType.ENTRADA.value)
        .group_by(Movement.lot_id)
    ).all()
    return {lot_id: float(total or 0) for lot_id, total in rows}


def find_available_lot_for_product(db: Session, product_id: int, quantity: float) -> Lot | None:
    snapshot = stock_snapshot(db)
    for row in snapshot:
        if row.product_id != product_id or row.current_stock < quantity:
            continue
        lot = db.get(Lot, row.lot_id)
        if lot:
            return lot
    return None


def calculate_solid_percentage(capsule: SolidCapsuleInput) -> float:
    if capsule.dry_weight <= capsule.empty_weight:
        raise HTTPException(
            status_code=400,
            detail="O peso seco deve ser maior que o peso da capsula vazia",
        )
    wet_paint = capsule.wet_weight
    dry_paint = capsule.dry_weight - capsule.empty_weight
    if wet_paint <= 0:
        raise HTTPException(status_code=400, detail="O peso da tinta deve ser maior que zero")
    return round((dry_paint / wet_paint) * 100, 2)


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


def serve_frontend_file(filename: str) -> FileResponse:
    file_path = FRONTEND_DIST / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Arquivo {filename} nao encontrado")
    return FileResponse(file_path)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_database_columns()
    with SessionLocal() as db:
        ensure_default_users(db)
        ensure_default_people(db)
        ensure_default_reasons(db)
        get_or_create_email_settings(db)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/login", response_model=LoginResponse)
def login(
    payload: LoginPayload,
    x_device_id: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> LoginResponse:
    username = payload.username.strip().lower()
    user = db.scalar(select(User).where(User.username == username))
    if not user or not user.active or user.password_hash != hash_password(payload.password):
        raise HTTPException(status_code=401, detail="Usuario ou senha invalidos")

    token = secrets.token_urlsafe(32)
    sessions[token] = user.id
    persist_session_token(db, token, user.id, x_device_id)
    return LoginResponse(token=token, user=serialize_user(user))


@app.get("/api/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)) -> UserRead:
    return serialize_user(user)


@app.post("/api/logout")
def logout(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        sessions.pop(token, None)
        session_row = db.scalar(select(SessionToken).where(SessionToken.token == token))
        if session_row:
            session_row.active = False
            db.commit()
    return {"status": "ok"}


@app.get("/api/users", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> list[UserRead]:
    users = db.scalars(select(User).order_by(User.role.asc(), User.full_name.asc())).all()
    return [serialize_user(user) for user in users]


@app.post("/api/users", response_model=UserRead)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> UserRead:
    username = payload.username.strip().lower()
    exists = db.scalar(select(User).where(User.username == username))
    if exists:
        raise HTTPException(status_code=400, detail="Usuario ja cadastrado")

    user = User(
        username=username,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role.value,
        active=payload.active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return serialize_user(user)


@app.put("/api/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> UserRead:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    username = payload.username.strip().lower()
    exists = db.scalar(select(User).where(User.username == username, User.id != user_id))
    if exists:
        raise HTTPException(status_code=400, detail="Usuario ja cadastrado")

    if (
        user.role == UserRole.AREA_TECNICA.value
        and (payload.role != UserRole.AREA_TECNICA or not payload.active)
        and active_technical_users_count(db, exclude_user_id=user_id) == 0
    ):
        raise HTTPException(
            status_code=400,
            detail="Deve existir pelo menos um usuario ativo da area tecnica",
        )

    user.username = username
    user.full_name = payload.full_name.strip()
    user.role = payload.role.value
    user.active = payload.active
    if payload.password:
        user.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(user)

    if not user.active and user.id == current_user.id:
        sessions_to_remove = [token for token, uid in sessions.items() if uid == user.id]
        for token in sessions_to_remove:
            sessions.pop(token, None)
    if not user.active:
        db.execute(
            text("UPDATE session_tokens SET active = 0 WHERE user_id = :user_id"),
            {"user_id": user.id},
        )
        db.commit()

    return serialize_user(user)


@app.get("/api/email-settings", response_model=EmailSettingsRead)
def get_email_settings_endpoint(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> EmailSettingsRead:
    return serialize_email_settings(get_or_create_email_settings(db))


@app.put("/api/email-settings", response_model=EmailSettingsRead)
def update_email_settings_endpoint(
    payload: EmailSettingsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> EmailSettingsRead:
    settings = get_or_create_email_settings(db)
    settings.enabled = payload.enabled
    settings.viscosity_alert_enabled = payload.viscosity_alert_enabled
    settings.expiry_alert_enabled = payload.expiry_alert_enabled
    settings.expiry_days = payload.expiry_days
    settings.smtp_host = normalize_optional_text(payload.smtp_host)
    settings.smtp_port = payload.smtp_port
    settings.smtp_username = normalize_optional_text(payload.smtp_username)
    if payload.smtp_password:
        settings.smtp_password = payload.smtp_password
    settings.use_tls = payload.use_tls
    settings.sender_name = normalize_optional_text(payload.sender_name)
    settings.sender_email = normalize_optional_text(payload.sender_email)
    db.commit()
    db.refresh(settings)
    return serialize_email_settings(settings)


@app.get("/api/email-recipients", response_model=list[EmailRecipientRead])
def list_email_recipients(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> list[EmailRecipient]:
    return db.scalars(select(EmailRecipient).order_by(EmailRecipient.email.asc())).all()


@app.post("/api/email-recipients", response_model=EmailRecipientRead)
def create_email_recipient(
    payload: EmailRecipientCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> EmailRecipient:
    email = normalize_email(payload.email)
    exists = db.scalar(select(EmailRecipient).where(EmailRecipient.email == email))
    if exists:
        raise HTTPException(status_code=400, detail="Destinatario ja cadastrado")

    recipient = EmailRecipient(
        name=normalize_optional_text(payload.name),
        email=email,
        active=payload.active,
        notes=normalize_optional_text(payload.notes),
    )
    db.add(recipient)
    db.commit()
    db.refresh(recipient)
    return recipient


@app.get("/api/email-drafts/expiry", response_model=EmailDraft | None)
def get_expiry_email_draft(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> EmailDraft | None:
    draft = build_expiry_email_draft(db)
    if not draft:
        return None
    if draft.alert_key and has_alert_log(db, draft.alert_key):
        return None
    return draft


@app.post("/api/email-drafts/expiry/mark-opened")
def mark_expiry_email_opened(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> dict[str, str]:
    alert_key = f"expiry-summary:{date.today().isoformat()}"
    if not has_alert_log(db, alert_key):
        create_alert_log(db, alert_key, "EXPIRY_DRAFT")
    return {"status": "ok"}


@app.get("/api/email-drafts/tank/{analysis_id}", response_model=EmailDraft | None)
def get_tank_email_draft(
    analysis_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ALMOXARIFE, UserRole.AREA_TECNICA)),
) -> EmailDraft | None:
    analysis = db.get(TankAnalysis, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analise nao encontrada")
    return build_tank_email_draft(db, analysis)


@app.put("/api/email-recipients/{recipient_id}", response_model=EmailRecipientRead)
def update_email_recipient(
    recipient_id: int,
    payload: EmailRecipientCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> EmailRecipient:
    recipient = db.get(EmailRecipient, recipient_id)
    if not recipient:
        raise HTTPException(status_code=404, detail="Destinatario nao encontrado")

    email = normalize_email(payload.email)
    exists = db.scalar(
        select(EmailRecipient).where(EmailRecipient.email == email, EmailRecipient.id != recipient_id)
    )
    if exists:
        raise HTTPException(status_code=400, detail="Destinatario ja cadastrado")

    recipient.name = normalize_optional_text(payload.name)
    recipient.email = email
    recipient.active = payload.active
    recipient.notes = normalize_optional_text(payload.notes)
    db.commit()
    db.refresh(recipient)
    return recipient


@app.get("/api/people", response_model=list[PersonRead])
def list_people(
    person_type: PersonType | None = None,
    active_only: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Person]:
    stmt = select(Person)
    if person_type:
        stmt = stmt.where(Person.type == person_type.value)
    if active_only:
        stmt = stmt.where(Person.active.is_(True))
    return db.scalars(stmt.order_by(Person.type.asc(), Person.name.asc())).all()


@app.post("/api/people", response_model=PersonRead)
def create_person(
    payload: PersonCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> Person:
    name = payload.name.strip().upper()
    exists = db.scalar(select(Person).where(func.upper(Person.name) == name))
    if exists:
        raise HTTPException(status_code=400, detail="Pessoa ja cadastrada")

    person = Person(
        name=name,
        type=payload.type.value,
        active=payload.active,
        notes=normalize_optional_text(payload.notes),
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


@app.put("/api/people/{person_id}", response_model=PersonRead)
def update_person(
    person_id: int,
    payload: PersonCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> Person:
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa nao encontrada")

    name = payload.name.strip().upper()
    exists = db.scalar(
        select(Person).where(func.upper(Person.name) == name, Person.id != person_id)
    )
    if exists:
        raise HTTPException(status_code=400, detail="Pessoa ja cadastrada")

    person.name = name
    person.type = payload.type.value
    person.active = payload.active
    person.notes = normalize_optional_text(payload.notes)
    db.commit()
    db.refresh(person)
    return person


@app.get("/api/reasons", response_model=list[ReasonRead])
def list_reasons(
    reason_type: ReasonType | None = None,
    active_only: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[MovementReason]:
    stmt = select(MovementReason)
    if reason_type:
        stmt = stmt.where(MovementReason.type == reason_type.value)
    if active_only:
        stmt = stmt.where(MovementReason.active.is_(True))
    return db.scalars(stmt.order_by(MovementReason.type.asc(), MovementReason.name.asc())).all()


@app.post("/api/reasons", response_model=ReasonRead)
def create_reason(
    payload: ReasonCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> MovementReason:
    name = payload.name.strip().upper()
    exists = db.scalar(select(MovementReason).where(func.upper(MovementReason.name) == name))
    if exists:
        raise HTTPException(status_code=400, detail="Motivo ja cadastrado")

    reason = MovementReason(
        name=name,
        type=payload.type.value,
        active=payload.active,
        notes=normalize_optional_text(payload.notes),
    )
    db.add(reason)
    db.commit()
    db.refresh(reason)
    return reason


@app.put("/api/reasons/{reason_id}", response_model=ReasonRead)
def update_reason(
    reason_id: int,
    payload: ReasonCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> MovementReason:
    reason = db.get(MovementReason, reason_id)
    if not reason:
        raise HTTPException(status_code=404, detail="Motivo nao encontrado")

    name = payload.name.strip().upper()
    exists = db.scalar(
        select(MovementReason).where(
            func.upper(MovementReason.name) == name,
            MovementReason.id != reason_id,
        )
    )
    if exists:
        raise HTTPException(status_code=400, detail="Motivo ja cadastrado")

    reason.name = name
    reason.type = payload.type.value
    reason.active = payload.active
    reason.notes = normalize_optional_text(payload.notes)
    db.commit()
    db.refresh(reason)
    return reason


@app.get("/api/tank-analyses", response_model=list[TankAnalysisRead])
def list_tank_analyses(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[TankAnalysisRead]:
    rows = db.scalars(
        select(TankAnalysis).order_by(
            TankAnalysis.analysis_date.desc(),
            TankAnalysis.analysis_time.desc(),
            TankAnalysis.id.desc(),
        )
    ).all()
    return [
        TankAnalysisRead(
            id=row.id,
            analysis_date=row.analysis_date,
            analysis_time=row.analysis_time,
            viscosity_seconds=row.viscosity_seconds,
            corrected_viscosity_seconds=row.corrected_viscosity_seconds,
            solvent_amount=row.solvent_amount,
            paint_amount=row.paint_amount,
            level_amount=row.level_amount,
            notes=row.notes,
            responsible=row.responsible,
            in_target_range=48 <= row.viscosity_seconds <= 52,
        )
        for row in rows
    ]


@app.post("/api/tank-analyses", response_model=TankAnalysisRead)
def create_tank_analysis(
    payload: TankAnalysisCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ALMOXARIFE, UserRole.AREA_TECNICA)),
) -> TankAnalysisRead:
    out_of_range = payload.viscosity_seconds < 48 or payload.viscosity_seconds > 52
    has_correction = any(
        value not in (None, 0) for value in [payload.solvent_amount, payload.paint_amount]
    )
    if out_of_range and has_correction and payload.corrected_viscosity_seconds is None:
        raise HTTPException(
            status_code=400,
            detail="Informe a viscosidade apos a correcao quando a leitura inicial estiver fora da faixa",
        )

    analysis = TankAnalysis(
        analysis_date=payload.analysis_date,
        analysis_time=normalize_optional_text(payload.analysis_time),
        viscosity_seconds=payload.viscosity_seconds,
        corrected_viscosity_seconds=payload.corrected_viscosity_seconds,
        solvent_amount=payload.solvent_amount,
        paint_amount=payload.paint_amount,
        level_amount=payload.level_amount,
        notes=normalize_optional_text(payload.notes),
        responsible=normalize_optional_text(payload.responsible),
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return TankAnalysisRead(
        id=analysis.id,
        analysis_date=analysis.analysis_date,
        analysis_time=analysis.analysis_time,
        viscosity_seconds=analysis.viscosity_seconds,
        corrected_viscosity_seconds=analysis.corrected_viscosity_seconds,
        solvent_amount=analysis.solvent_amount,
        paint_amount=analysis.paint_amount,
        level_amount=analysis.level_amount,
        notes=analysis.notes,
        responsible=analysis.responsible,
        in_target_range=48 <= analysis.viscosity_seconds <= 52,
    )


@app.get("/api/solid-content-analyses", response_model=list[SolidContentAnalysisRead])
def list_solid_content_analyses(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[SolidContentAnalysisRead]:
    rows = db.scalars(
        select(SolidContentAnalysis).order_by(
            SolidContentAnalysis.analysis_date.desc(),
            SolidContentAnalysis.analysis_time.desc(),
            SolidContentAnalysis.id.desc(),
        )
    ).all()
    return [
        SolidContentAnalysisRead(
            id=row.id,
            analysis_date=row.analysis_date,
            analysis_time=row.analysis_time,
            capsule1_percentage=round(((row.capsule1_dry_weight - row.capsule1_empty_weight) / row.capsule1_wet_weight) * 100, 2),
            capsule2_percentage=round(((row.capsule2_dry_weight - row.capsule2_empty_weight) / row.capsule2_wet_weight) * 100, 2),
            capsule3_percentage=round(((row.capsule3_dry_weight - row.capsule3_empty_weight) / row.capsule3_wet_weight) * 100, 2),
            average_percentage=row.average_percentage,
            notes=row.notes,
            responsible=row.responsible,
            in_target_range=30 <= row.average_percentage <= 32,
        )
        for row in rows
    ]


@app.post("/api/solid-content-analyses", response_model=SolidContentAnalysisRead)
def create_solid_content_analysis(
    payload: SolidContentAnalysisCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ALMOXARIFE, UserRole.AREA_TECNICA)),
) -> SolidContentAnalysisRead:
    capsule1_percentage = calculate_solid_percentage(payload.capsule1)
    capsule2_percentage = calculate_solid_percentage(payload.capsule2)
    capsule3_percentage = calculate_solid_percentage(payload.capsule3)
    average_percentage = round(
        (capsule1_percentage + capsule2_percentage + capsule3_percentage) / 3,
        2,
    )

    analysis = SolidContentAnalysis(
        analysis_date=payload.analysis_date,
        analysis_time=normalize_optional_text(payload.analysis_time),
        capsule1_empty_weight=payload.capsule1.empty_weight,
        capsule1_wet_weight=payload.capsule1.wet_weight,
        capsule1_dry_weight=payload.capsule1.dry_weight,
        capsule2_empty_weight=payload.capsule2.empty_weight,
        capsule2_wet_weight=payload.capsule2.wet_weight,
        capsule2_dry_weight=payload.capsule2.dry_weight,
        capsule3_empty_weight=payload.capsule3.empty_weight,
        capsule3_wet_weight=payload.capsule3.wet_weight,
        capsule3_dry_weight=payload.capsule3.dry_weight,
        average_percentage=average_percentage,
        notes=normalize_optional_text(payload.notes),
        responsible=normalize_optional_text(payload.responsible),
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    return SolidContentAnalysisRead(
        id=analysis.id,
        analysis_date=analysis.analysis_date,
        analysis_time=analysis.analysis_time,
        capsule1_percentage=capsule1_percentage,
        capsule2_percentage=capsule2_percentage,
        capsule3_percentage=capsule3_percentage,
        average_percentage=analysis.average_percentage,
        notes=analysis.notes,
        responsible=analysis.responsible,
        in_target_range=30 <= analysis.average_percentage <= 32,
    )


@app.get("/api/products", response_model=list[ProductRead])
def list_products(
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Product]:
    stmt = select(Product)
    if q and q.strip():
        term = f"%{normalize_code(q)}%"
        stmt = stmt.where(
            func.upper(Product.code).like(term) | func.upper(Product.name).like(term)
        )
    return db.scalars(stmt.order_by(Product.name.asc())).all()


@app.post("/api/products", response_model=ProductRead)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> Product:
    normalized_code = normalize_code(payload.code)
    exists = db.scalar(select(Product).where(Product.code == normalized_code))
    if exists:
        raise HTTPException(status_code=400, detail="Codigo de produto ja cadastrado")

    product = Product(
        code=normalized_code,
        name=payload.name.strip(),
        category=payload.category.strip().upper(),
        unit=payload.unit.strip().upper(),
        minimum_stock=payload.minimum_stock,
        storage_location=normalize_optional_text(payload.storage_location),
        notes=normalize_optional_text(payload.notes),
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@app.put("/api/products/{product_id}", response_model=ProductRead)
def update_product(
    product_id: int,
    payload: ProductCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> Product:
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto nao encontrado")

    normalized_code = normalize_code(payload.code)
    exists = db.scalar(
        select(Product).where(Product.code == normalized_code, Product.id != product_id)
    )
    if exists:
        raise HTTPException(status_code=400, detail="Codigo de produto ja cadastrado")

    product.code = normalized_code
    product.name = payload.name.strip()
    product.category = payload.category.strip().upper()
    product.unit = payload.unit.strip().upper()
    product.minimum_stock = payload.minimum_stock
    product.storage_location = normalize_optional_text(payload.storage_location)
    product.notes = normalize_optional_text(payload.notes)
    db.commit()
    db.refresh(product)
    return product


@app.delete("/api/products/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> dict[str, str]:
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto nao encontrado")
    if product.lots:
        raise HTTPException(
            status_code=400,
            detail="Produto com lotes cadastrados nao pode ser excluido",
        )

    db.delete(product)
    db.commit()
    return {"status": "ok"}


@app.get("/api/lots", response_model=list[LotRead])
def list_lots(
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[LotRead]:
    received_map = lot_received_map(db)
    stmt = (
        select(Lot, Product.name, Product.code)
        .join(Product, Product.id == Lot.product_id)
        .order_by(Lot.code.asc(), Product.name.asc(), Lot.expiry_date.asc())
    )
    if q and q.strip():
        term = f"%{normalize_code(q)}%"
        stmt = stmt.where(
            func.upper(Product.code).like(term)
            | func.upper(Product.name).like(term)
            | func.upper(Lot.code).like(term)
        )
    rows = db.execute(stmt).all()

    return [
        LotRead(
            id=lot.id,
            product_id=lot.product_id,
            code=lot.code,
            manufacture_date=lot.manufacture_date,
            expiry_date=lot.expiry_date,
            purchase_quantity=lot.purchase_quantity,
            supplier_type=lot.supplier_type,
            external_supplier=lot.external_supplier,
            notes=lot.notes,
            product_name=product_name,
            product_code=product_code,
            received_quantity=round(received_map.get(lot.id, 0), 2),
            remaining_quantity=round(
                max(0, float(lot.purchase_quantity or 0) - received_map.get(lot.id, 0)),
                2,
            ),
        )
        for lot, product_name, product_code in rows
    ]


@app.post("/api/lots", response_model=LotRead)
def create_lot(
    payload: LotCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> LotRead:
    product = db.get(Product, payload.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto nao encontrado")

    code = normalize_code(payload.code)
    duplicate = db.scalar(
        select(Lot).where(
            Lot.product_id == payload.product_id,
            Lot.code == code,
            Lot.expiry_date == payload.expiry_date,
        )
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="Compra ja cadastrada para este item e validade")

    external_supplier = normalize_optional_text(payload.external_supplier)
    if payload.supplier_type == SupplierType.EXTERNO and not external_supplier:
        raise HTTPException(
            status_code=400,
            detail="Informe o fornecedor externo para esta compra",
        )

    supplier_name = "WEG" if payload.supplier_type == SupplierType.WEG else external_supplier

    lot = Lot(
        product_id=payload.product_id,
        code=code,
        manufacture_date=payload.manufacture_date,
        expiry_date=payload.expiry_date,
        purchase_quantity=payload.purchase_quantity,
        supplier=supplier_name,
        supplier_type=payload.supplier_type.value,
        external_supplier=external_supplier if payload.supplier_type == SupplierType.EXTERNO else None,
        notes=normalize_optional_text(payload.notes),
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
        purchase_quantity=lot.purchase_quantity,
        supplier_type=payload.supplier_type,
        external_supplier=lot.external_supplier,
        notes=lot.notes,
        product_name=product.name,
        product_code=product.code,
        received_quantity=0,
        remaining_quantity=round(float(lot.purchase_quantity or 0), 2),
    )


@app.post("/api/purchases", response_model=list[LotRead])
def create_purchase_batch(
    payload: PurchaseBatchCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.AREA_TECNICA)),
) -> list[LotRead]:
    created: list[LotRead] = []
    external_supplier = normalize_optional_text(payload.external_supplier)
    if payload.supplier_type == SupplierType.EXTERNO and not external_supplier:
        raise HTTPException(
            status_code=400,
            detail="Informe o fornecedor externo para esta compra",
        )

    supplier_name = "WEG" if payload.supplier_type == SupplierType.WEG else external_supplier
    purchase_code = normalize_code(payload.code)

    for item in payload.items:
        product = db.get(Product, item.product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Produto nao encontrado")

        duplicate = db.scalar(
            select(Lot).where(
                Lot.product_id == item.product_id,
                Lot.code == purchase_code,
            )
        )
        if duplicate:
            raise HTTPException(
                status_code=400,
                detail=f"Compra ja cadastrada para o item {product.code} com esta validade",
            )

        lot = Lot(
            product_id=item.product_id,
            code=purchase_code,
            manufacture_date=None,
            expiry_date=None,
            purchase_quantity=item.purchase_quantity,
            supplier=supplier_name,
            supplier_type=payload.supplier_type.value,
            external_supplier=external_supplier if payload.supplier_type == SupplierType.EXTERNO else None,
            notes=normalize_optional_text(item.notes),
        )
        db.add(lot)
        db.flush()

        created.append(
            LotRead(
                id=lot.id,
                product_id=lot.product_id,
                code=lot.code,
                manufacture_date=None,
                expiry_date=None,
                purchase_quantity=lot.purchase_quantity,
                supplier_type=payload.supplier_type,
                external_supplier=lot.external_supplier,
                notes=lot.notes,
                product_name=product.name,
                product_code=product.code,
                received_quantity=0,
                remaining_quantity=round(float(lot.purchase_quantity or 0), 2),
            )
        )

    db.commit()
    return created


@app.get("/api/movements", response_model=list[MovementRead])
def list_movements(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[MovementRead]:
    rows = db.execute(
        select(Movement, Product.name, Product.code, Lot.code)
        .join(Lot, Lot.id == Movement.lot_id)
        .join(Product, Product.id == Lot.product_id)
        .order_by(Movement.movement_date.desc(), Movement.id.desc())
    ).all()

    return [
        MovementRead(
            id=mov.id,
            lot_id=mov.lot_id,
            product_id=None,
            type=mov.type,
            movement_date=mov.movement_date,
            movement_time=mov.movement_time,
            shift=mov.shift,
            is_overtime=mov.is_overtime,
            quantity=mov.quantity,
            manufacture_date=None,
            expiry_date=None,
            responsible=mov.responsible,
            destination_reason=mov.destination_reason,
            notes=mov.notes,
            product_name=product_name,
            product_code=product_code,
            lot_code=lot_code,
        )
        for mov, product_name, product_code, lot_code in rows
    ]


@app.post("/api/movements", response_model=MovementRead)
def create_movement(
    payload: MovementCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ALMOXARIFE, UserRole.AREA_TECNICA)),
) -> MovementRead:
    lot: Lot | None = None
    if payload.type == MovementType.ENTRADA:
        if not payload.lot_id:
            raise HTTPException(status_code=400, detail="Selecione a compra para o recebimento")
        lot = db.get(Lot, payload.lot_id)
        if not lot:
            raise HTTPException(status_code=404, detail="Compra nao encontrada")
    else:
        if not payload.product_id:
            raise HTTPException(status_code=400, detail="Selecione o produto para a saida")
        lot = find_available_lot_for_product(db, payload.product_id, payload.quantity)
        if not lot:
            raise HTTPException(
                status_code=400,
                detail="Nao ha saldo disponivel para o produto selecionado",
            )

    if payload.type == MovementType.ENTRADA:
        if not payload.manufacture_date or not payload.expiry_date:
            raise HTTPException(
                status_code=400,
                detail="Fabricacao e validade devem ser informadas no recebimento",
            )
        lot.manufacture_date = payload.manufacture_date
        lot.expiry_date = payload.expiry_date
    else:
        snapshot = {row.lot_id: row.current_stock for row in stock_snapshot(db)}
        current = snapshot.get(lot.id, 0)
        if payload.quantity > current:
            raise HTTPException(status_code=400, detail="Saldo insuficiente para essa saida")

    resolved_shift = payload.shift or infer_shift(payload.movement_time)
    resolved_responsible = normalize_optional_text(payload.responsible)
    if payload.type != MovementType.ENTRADA:
        resolved_responsible = "ALMOXARIFE DE INFLAMAVEIS"

    movement = Movement(
        lot_id=lot.id,
        type=payload.type.value,
        movement_date=payload.movement_date,
        movement_time=normalize_optional_text(payload.movement_time),
        shift=resolved_shift.value if resolved_shift else None,
        is_overtime=payload.is_overtime,
        quantity=payload.quantity,
        responsible=resolved_responsible,
        destination_reason=normalize_optional_text(payload.destination_reason),
        notes=normalize_optional_text(payload.notes),
    )

    db.add(movement)
    db.commit()
    db.refresh(movement)

    product_row = db.execute(
        select(Product.name, Product.code)
        .join(Lot, Lot.product_id == Product.id)
        .where(Lot.id == movement.lot_id)
    ).first()
    product_name = product_row[0] if product_row else ""
    product_code = product_row[1] if product_row else ""
    return MovementRead(
        id=movement.id,
        lot_id=movement.lot_id,
        product_id=lot.product_id,
        type=movement.type,
        movement_date=movement.movement_date,
        movement_time=movement.movement_time,
        shift=movement.shift,
        is_overtime=movement.is_overtime,
        quantity=movement.quantity,
        manufacture_date=payload.manufacture_date,
        expiry_date=payload.expiry_date,
        responsible=movement.responsible,
        destination_reason=movement.destination_reason,
        notes=movement.notes,
        product_name=product_name,
        product_code=product_code,
        lot_code=lot.code,
    )


@app.get("/api/stock", response_model=list[StockRow])
def get_stock(
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[StockRow]:
    rows = stock_snapshot(db)
    if not q or not q.strip():
        return rows

    term = normalize_code(q)
    return [
        row
        for row in rows
        if term in row.product_code.upper()
        or term in row.product_name.upper()
        or term in row.lot_code.upper()
    ]


@app.get("/api/dashboard", response_model=Dashboard)
def get_dashboard(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Dashboard:
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


@app.get("/favicon.ico")
def serve_favicon() -> FileResponse:
    return serve_frontend_file("favicon.ico")


@app.get("/logo-weg-256.png")
def serve_logo() -> FileResponse:
    return serve_frontend_file("logo-weg-256.png")


@app.get("/{full_path:path}")
def serve_spa(full_path: str) -> FileResponse:
    if full_path.startswith("api"):
        raise HTTPException(status_code=404, detail="Rota nao encontrada")

    index_file = FRONTEND_DIST / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=503, detail="Frontend nao compilado")
    return FileResponse(index_file)
