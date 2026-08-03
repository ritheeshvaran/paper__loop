"""Paper & Loop – Backend API (FastAPI + MongoDB)."""
from __future__ import annotations

import os
import re
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Literal

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from mongo_client import create_motor_client, normalize_mongo_url
from pydantic import BaseModel, Field, EmailStr, ConfigDict, field_validator, model_validator
from starlette.middleware.cors import CORSMiddleware
from seed_data import (
    CATEGORIES,
    GALLERY_FILENAMES,
    PRODUCTS,
    TESTIMONIALS,
    copy_all_assets,
    copy_asset,
    default_settings,
    upload_url,
)
from email_service import email_service, email_configured
from security_utils import (
    gen_otp,
    hash_otp,
    verify_otp_hash,
    detect_image,
    ensure_indexes,
    check_rate_limit,
    check_otp_cooldown,
    OTP_TTL_MINUTES,
    OTP_MAX_ATTEMPTS,
    OTP_SEND_LIMIT,
    OTP_SEND_WINDOW_MIN,
    OTP_SEND_COOLDOWN_SEC,
    LOGIN_MAX_ATTEMPTS,
    LOGIN_WINDOW_MIN,
    ALLOWED_IMAGE_MIME,
)


# ─── Setup ──────────────────────────────────────────────────────────────────
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

MONGO_URL = normalize_mongo_url(os.environ["MONGO_URL"])
DB_NAME = os.environ["DB_NAME"]
APP_ENV = os.environ.get("APP_ENV", "development")
JWT_SECRET = os.environ.get("JWT_SECRET", "").strip()
if not JWT_SECRET:
    if APP_ENV == "production":
        raise RuntimeError("JWT_SECRET must be set in production")
    JWT_SECRET = "paper-loop-dev-secret-change-me"
    logging.getLogger("paperloop").warning("Using insecure default JWT_SECRET — set JWT_SECRET before production")

JWT_ALG = "HS256"
JWT_TTL_HOURS = int(os.environ.get("JWT_TTL_HOURS", str(24 * 7)))  # 7 days default
BRAND_NAME = "Paper & Loop"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "ritheeshvaran2007@gmail.com").strip().lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "").strip()

if APP_ENV == "production" and not email_configured():
    logging.getLogger("paperloop").error(
        "PRODUCTION: No email provider configured. Set RESEND_API_KEY or SMTP_* — OTP will fail until configured."
    )
# Render always sets RENDER=true — catch misconfigured APP_ENV on the live service
_paperloop_boot = logging.getLogger("paperloop")
if os.environ.get("RENDER") == "true" and APP_ENV != "production":
    _paperloop_boot.error(
        "RENDER DETECTED but APP_ENV=%s (expected production). "
        "OTP failures return HTTP 200 with delivery errors, rate limits are off, "
        "and send-otp responses include dev_code. Set APP_ENV=production in the Render dashboard.",
        APP_ENV,
    )
_paperloop_boot.info(
    "Email config: configured=%s app_env=%s",
    email_configured(),
    APP_ENV,
)


def _mongo_cluster_label(url: str) -> str:
    """Return cluster/host for logs — never includes credentials."""
    try:
        if "@" in url:
            host_part = url.split("@", 1)[1]
        else:
            host_part = url.split("://", 1)[-1]
        return host_part.split("/")[0].split("?")[0]
    except Exception:
        return "unknown"


async def _verify_mongodb_connection() -> bool:
    """Ping MongoDB and log connection outcome. Returns True if reachable."""
    cluster = _mongo_cluster_label(MONGO_URL)
    is_atlas = MONGO_URL.startswith("mongodb+srv://")
    try:
        await client.admin.command("ping")
        if is_atlas:
            log.info(
                "Connected to MongoDB Atlas successfully. database=%s cluster=%s",
                DB_NAME,
                cluster,
            )
        else:
            log.info(
                "Connected to MongoDB successfully. database=%s host=%s",
                DB_NAME,
                cluster,
            )
        return True
    except Exception as exc:
        log.error(
            "MongoDB connection failed. database=%s cluster=%s error=%s",
            DB_NAME,
            cluster,
            exc,
        )
        log.error(
            "Atlas TLS tip: whitelist Render outbound IPs in Atlas Network Access; "
            "ensure MONGO_URL uses mongodb+srv:// and certifi is installed."
        )
        return False


client = create_motor_client(MONGO_URL)
db = client[DB_NAME]
_mongo_ready = False
_categories_by_slug: dict = {}


async def _refresh_categories_cache() -> None:
    global _categories_by_slug
    cats = await db.categories.find({}, {"_id": 0}).to_list(200)
    _categories_by_slug = {c["slug"]: c for c in cats if c.get("slug")}


def _validate_media_field(url: Optional[str], *, field: str, required: bool = False) -> None:
    from media_validation import validate_media_url_or_raise

    if not url or not str(url).strip():
        if required:
            raise HTTPException(400, f"{field} is required")
        return
    try:
        validate_media_url_or_raise(str(url).strip(), field=field)
    except ValueError as e:
        raise HTTPException(400, str(e))


def _validate_product_media(inp: ProductInput) -> None:
    from media_validation import validate_media_urls_or_raise

    urls = [u for u in (inp.images or []) if u and str(u).strip()]
    if urls:
        try:
            validate_media_urls_or_raise(urls, field="images")
        except ValueError as e:
            raise HTTPException(400, str(e))
    if inp.lifestyle_image and str(inp.lifestyle_image).strip():
        _validate_media_field(inp.lifestyle_image, field="lifestyle_image")

app = FastAPI(title="Paper & Loop API")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("paperloop")


# ─── Helpers ────────────────────────────────────────────────────────────────
def now_iso() -> str: return datetime.now(timezone.utc).isoformat()
def new_id() -> str: return str(uuid.uuid4())
def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.strip().lower()).strip("-")
    return s or new_id()[:8]
def hash_pw(pw: str) -> str: return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
def verify_pw(pw: str, hashed: str) -> bool:
    try: return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception: return False
def make_token(user_id: str, role: str, token_version: int = 0) -> str:
    return jwt.encode({
        "sub": user_id,
        "role": role,
        "tv": token_version,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS),
        "iat": datetime.now(timezone.utc),
    }, JWT_SECRET, algorithm=JWT_ALG)
def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
def strip_id(doc):
    if doc is None: return None
    doc.pop("_id", None); return doc


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def get_current_user(cred: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    if not cred: raise HTTPException(401, "Not authenticated")
    try: payload = decode_token(cred.credentials)
    except jwt.PyJWTError: raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or user.get("is_blocked"): raise HTTPException(401, "User not found or blocked")
    if int(payload.get("tv", 0)) != int(user.get("token_version", 0)):
        raise HTTPException(401, "Session expired — please sign in again")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin": raise HTTPException(403, "Admin only")
    return user


# ─── Models ─────────────────────────────────────────────────────────────────
class SendOtpInput(BaseModel):
    email: EmailStr
    purpose: Literal["registration", "password_reset"] = "registration"


class VerifyOtpInput(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=8)
    purpose: Literal["registration", "password_reset"] = "registration"


class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=120)
    phone: str = ""
    address_line1: str = ""
    address_line2: str = ""
    city: str = ""
    state: str = ""
    pincode: str = ""
    otp_token: str  # required — returned by verify-otp


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None


class ResetPasswordInput(BaseModel):
    email: EmailStr
    otp_token: str
    new_password: str = Field(min_length=8, max_length=128)


class CategoryInput(BaseModel):
    name: str
    slug: Optional[str] = None
    banner_image_url: Optional[str] = None
    sort_order: int = 0


class ProductInput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    slug: Optional[str] = None
    category_slug: str
    description: str = ""
    price: float
    discount_percent: float = 0
    stock_quantity: int = Field(default=10, ge=0)
    status: Literal["ACTIVE", "SOLD_OUT", "COMING_SOON"] = "ACTIVE"
    images: List[str] = []
    lifestyle_image: Optional[str] = None
    material: str = "Premium 250gsm matte paper"
    size: str = "A3 (11.7 x 16.5 in)"
    finish: str = "Matte"
    is_featured: bool = False
    is_trending: bool = False
    is_best_seller: bool = False
    is_new: bool = True
    is_limited: bool = False
    visibility: Literal["draft", "published"] = "published"

    @field_validator("stock_quantity", mode="before")
    @classmethod
    def coerce_stock(cls, v):
        if v is None or (isinstance(v, str) and v.strip() == ""):
            raise ValueError("Stock quantity is required")
        try:
            n = int(v)
        except (TypeError, ValueError):
            raise ValueError("Stock quantity must be a whole number")
        if n < 0:
            raise ValueError("Stock quantity cannot be negative")
        return n

    @field_validator("status", mode="before")
    @classmethod
    def coerce_status(cls, v):
        if v is None or (isinstance(v, str) and v.strip() == ""):
            return "ACTIVE"
        s = str(v).strip().upper().replace(" ", "_")
        if s not in ("ACTIVE", "SOLD_OUT", "COMING_SOON"):
            raise ValueError("Status must be ACTIVE, SOLD_OUT, or COMING_SOON")
        return s


class ProductStatusInput(BaseModel):
    status: Literal["ACTIVE", "SOLD_OUT", "COMING_SOON"]


class CartItemInput(BaseModel):
    product_id: str
    quantity: int = 1


class CheckoutInput(BaseModel):
    delivery_type: Literal["woxsen_university", "outside_woxsen"] = "outside_woxsen"
    order_note: str = ""
    customer_name: Optional[str] = None
    phone: str = ""
    email: Optional[EmailStr] = None
    # Woxsen campus delivery
    tower: str = ""
    room_number: str = ""
    delivery_instructions: str = ""
    # Outside delivery (postal address)
    address_line1: str = ""
    address_line2: str = ""
    address_line3: str = ""
    landmark: str = ""
    city: str = ""
    state: str = ""
    pincode: str = ""
    country: str = "India"

    @field_validator("delivery_type", mode="before")
    @classmethod
    def normalize_delivery_type(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return "outside_woxsen"
        s = str(v).strip().lower().replace(" ", "_")
        if s in ("woxsen", "woxsen_university", "campus"):
            return "woxsen_university"
        if s in ("outside", "outside_woxsen", "home", "postal"):
            return "outside_woxsen"
        return v

    @model_validator(mode="after")
    def validate_by_delivery_type(self):
        name = (self.customer_name or "").strip()
        phone = (self.phone or "").strip()
        if self.delivery_type == "woxsen_university":
            if not name:
                raise ValueError("Full name is required")
            if not phone:
                raise ValueError("Mobile number is required")
            if not (self.tower or "").strip():
                raise ValueError("Tower / Hostel is required")
            if not (self.room_number or "").strip():
                raise ValueError("Room number is required")
        else:
            if not name:
                raise ValueError("Full name is required")
            if not phone:
                raise ValueError("Mobile number is required")
            if not (self.address_line1 or "").strip():
                raise ValueError("Address line 1 is required")
            if not (self.city or "").strip():
                raise ValueError("City is required")
            if not (self.state or "").strip():
                raise ValueError("State is required")
            if not (self.pincode or "").strip():
                raise ValueError("Pincode is required")
        return self


class SubmitPaymentInput(BaseModel):
    transaction_id: str = Field(min_length=6, max_length=64)
    payment_screenshot_url: str = Field(min_length=1)


class UpdateOrderStatusInput(BaseModel):
    status: str
    note: Optional[str] = None


class PaymentDecisionInput(BaseModel):
    note: Optional[str] = None
    delivery_date: Optional[str] = None  # required when approving


class SetDeliveryDateInput(BaseModel):
    delivery_date: str


class SettingsUpdate(BaseModel):
    logo_url: Optional[str] = None
    hero_images: Optional[List[str]] = None
    hero_background_url: Optional[str] = None
    gpay_qr_url: Optional[str] = None
    upi_id: Optional[str] = None
    announcement: Optional[str] = None
    instagram_url: Optional[str] = None
    whatsapp_url: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None


class NewsletterInput(BaseModel):
    email: EmailStr
    source: str = "footer"


class TestEmailInput(BaseModel):
    email: EmailStr


class RestockAlertInput(BaseModel):
    email: EmailStr
    product_id: str


class TestimonialInput(BaseModel):
    name: str
    quote: str
    location: Optional[str] = ""
    photo_url: Optional[str] = ""
    rating: int = 5
    title: Optional[str] = ""
    hidden: bool = False


class ReviewInput(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: str = Field(min_length=2, max_length=120)
    quote: str = Field(min_length=10, max_length=2000)
    photo_url: Optional[str] = ""
    product_id: Optional[str] = None


class GalleryItemInput(BaseModel):
    image_url: str
    caption: Optional[str] = ""
    link_url: Optional[str] = ""
    sort_order: int = 0


class DiscountInput(BaseModel):
    name: str
    type: Literal["percent", "flat"] = "percent"
    value: float
    applies_to: Literal["all", "category", "product"] = "all"
    target_slug: Optional[str] = None
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None
    is_featured_sale: bool = False
    is_active: bool = True


# Canonical lifecycle. packed/out_for_delivery kept for legacy orders only.
ORDER_FLOW = ["placed", "payment_under_validation", "approved",
              "preparing", "packed", "out_for_delivery", "delivered"]
ADMIN_ADVANCE_FLOW = ["preparing", "delivered"]


# ─── OTP Endpoints ──────────────────────────────────────────────────────────
GENERIC_OTP_SENT = {
    "sent": True,
    "expires_in": OTP_TTL_MINUTES * 60,
    "message": "If that email can receive a code, one has been sent.",
}


async def _consume_otp_token(token: str, email: str, purpose: str) -> None:
    """Validate otp_token JWT and mark jti single-use (prevents replay)."""
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise HTTPException(400, "OTP verification expired or invalid")
    if payload.get("email") != email.lower() or payload.get("purpose") != purpose:
        raise HTTPException(400, "OTP verification mismatch")
    jti = payload.get("jti")
    if not jti:
        raise HTTPException(400, "OTP verification expired or invalid")
    existing = await db.otp_tokens.find_one({"jti": jti})
    if not existing or existing.get("consumed"):
        raise HTTPException(400, "OTP verification already used or invalid")
    await db.otp_tokens.update_one(
        {"jti": jti},
        {"$set": {"consumed": True, "consumed_at": now_iso()}},
    )


@api.post("/auth/send-otp")
async def send_otp(inp: SendOtpInput, request: Request):
    email = inp.email.lower().strip()
    ip = _client_ip(request)

    log.info("OTP requested email=%s purpose=%s ip=%s", email, inp.purpose, ip)

    allowed, retry_after = await check_otp_cooldown(db, email, inp.purpose)
    if not allowed:
        raise HTTPException(
            429,
            detail={"message": f"Please wait {retry_after}s before requesting another code.", "retry_after": retry_after},
        )

    if not await check_rate_limit(db, f"otp-email:{email}:{inp.purpose}", OTP_SEND_LIMIT, OTP_SEND_WINDOW_MIN):
        raise HTTPException(429, "Too many codes sent to this email. Try again in an hour.")
    if not await check_rate_limit(db, f"otp-ip:{ip}", OTP_SEND_LIMIT * 3, OTP_SEND_WINDOW_MIN):
        raise HTTPException(429, "Too many attempts from this network. Try again later.")

    # Anti-enumeration: always return the same success shape when possible
    existing = await db.users.find_one({"email": email})
    should_send = False
    if inp.purpose == "registration":
        should_send = existing is None
    else:  # password_reset
        should_send = existing is not None

    if not should_send:
        log.info("OTP skipped (anti-enumeration) email=%s purpose=%s", email, inp.purpose)
        return {**GENERIC_OTP_SENT, "delivery": "skipped", "retry_after": OTP_SEND_COOLDOWN_SEC}

    if APP_ENV == "production" and not email_configured():
        log.error("OTP send blocked — email provider not configured")
        raise HTTPException(503, "Email service unavailable. Try again later.")

    code = gen_otp()
    expires = datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)
    # Replace any existing unused codes for this email+purpose
    await db.otp_verifications.delete_many(
        {"email": email, "purpose": inp.purpose, "consumed": False},
    )
    doc = {
        "id": new_id(),
        "email": email,
        "purpose": inp.purpose,
        "code_hash": hash_otp(code, JWT_SECRET),
        "expires_at": expires,
        "verified_at": None,
        "consumed": False,
        "attempts": 0,
        "created_at": now_iso(),
        "ip": ip,
    }
    await db.otp_verifications.insert_one(doc)

    email_res = await email_service.send_otp_email(email, code, inp.purpose)
    if email_res.get("status") != "sent":
        log.error("OTP send failed email=%s purpose=%s error=%s", email, inp.purpose, email_res.get("error"))
        if APP_ENV == "production":
            raise HTTPException(503, "Could not send verification email. Try again shortly.")
        return {
            **GENERIC_OTP_SENT,
            "delivery": email_res.get("status"),
            "retry_after": OTP_SEND_COOLDOWN_SEC,
            "dev_code": code,
            "warning": "Email delivery failed in development — use dev_code to verify.",
        }

    log.info("OTP sent email=%s purpose=%s provider=%s", email, inp.purpose, email_res.get("provider"))
    resp = {**GENERIC_OTP_SENT, "delivery": "sent", "retry_after": OTP_SEND_COOLDOWN_SEC}
    if APP_ENV != "production":
        resp["dev_code"] = code  # local/test helper — never returned in production
    return resp


@api.post("/auth/verify-otp")
async def verify_otp(inp: VerifyOtpInput, request: Request):
    email = inp.email.lower().strip()
    ip = _client_ip(request)
    if not await check_rate_limit(db, f"otp-verify:{email}:{ip}", 20, 10):
        raise HTTPException(429, "Too many attempts. Try again in a bit.")

    doc = await db.otp_verifications.find_one({
        "email": email, "purpose": inp.purpose, "consumed": False,
    }, sort=[("created_at", -1)])
    if not doc:
        raise HTTPException(400, "Invalid or expired code. Request a new one.")
    if doc.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
        raise HTTPException(429, "Too many attempts. Request a new code.")

    expires_at = doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "Code expired. Request a new one.")

    # Support both new HMAC hashes and legacy bcrypt hashes during transition
    code = inp.code.strip()
    ok = False
    digest = doc["code_hash"]
    if len(digest) == 64 and all(c in "0123456789abcdef" for c in digest.lower()):
        ok = verify_otp_hash(code, digest, JWT_SECRET)
    else:
        ok = verify_pw(code, digest)
    if not ok:
        await db.otp_verifications.update_one({"id": doc["id"]}, {"$inc": {"attempts": 1}})
        remaining = OTP_MAX_ATTEMPTS - doc.get("attempts", 0) - 1
        log.info("OTP verify failed email=%s purpose=%s attempts_left=%s", email, inp.purpose, remaining)
        raise HTTPException(400, "Incorrect code")

    jti = new_id()
    token_exp = datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)
    token = jwt.encode({
        "email": email,
        "purpose": inp.purpose,
        "jti": jti,
        "exp": token_exp,
    }, JWT_SECRET, algorithm=JWT_ALG)
    await db.otp_tokens.insert_one({
        "jti": jti,
        "email": email,
        "purpose": inp.purpose,
        "consumed": False,
        "expires_at": token_exp,
        "created_at": now_iso(),
    })
    await db.otp_verifications.delete_one({"id": doc["id"]})
    log.info("OTP verified email=%s purpose=%s", email, inp.purpose)
    return {"verified": True, "otp_token": token}


# ─── Auth Routes ────────────────────────────────────────────────────────────
@api.post("/auth/register")
async def register(inp: RegisterInput):
    email = inp.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Unable to create account with that email")
    await _consume_otp_token(inp.otp_token, email, "registration")
    # Only the configured ADMIN_EMAIL may ever be admin — never via self-register
    role = "customer"
    user = {
        "id": new_id(), "email": email,
        "password_hash": hash_pw(inp.password),
        "name": inp.name.strip(), "phone": inp.phone,
        "address_line1": inp.address_line1, "address_line2": inp.address_line2,
        "city": inp.city, "state": inp.state, "pincode": inp.pincode,
        "role": role, "is_blocked": False,
        "email_verified": True,
        "token_version": 0,
        "created_at": now_iso(),
    }
    try:
        await db.users.insert_one(user)
    except Exception:
        raise HTTPException(400, "Unable to create account with that email")
    token = make_token(user["id"], user["role"], 0)
    user.pop("password_hash", None); user.pop("_id", None)
    asyncio.create_task(email_service.send(
        email,
        f"Welcome to {BRAND_NAME}",
        f"<div style='font-family:sans-serif;padding:20px'><h2>Welcome, {inp.name}.</h2>"
        f"<p>Your account is live. First drop alerts are on their way.</p></div>",
    ))
    return {"token": token, "user": user}


@api.post("/auth/login")
async def login(inp: LoginInput, request: Request):
    email = inp.email.lower().strip()
    ip = _client_ip(request)
    if not await check_rate_limit(db, f"login:{email}", LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MIN):
        raise HTTPException(429, "Too many login attempts. Try again later.")
    if not await check_rate_limit(db, f"login-ip:{ip}", LOGIN_MAX_ATTEMPTS * 3, LOGIN_WINDOW_MIN):
        raise HTTPException(429, "Too many login attempts. Try again later.")

    user = await db.users.find_one({"email": email})
    # Uniform error — prevent account enumeration
    invalid = HTTPException(401, "Invalid email or password")
    if not user or not verify_pw(inp.password, user["password_hash"]):
        raise invalid
    if user.get("is_blocked"):
        raise HTTPException(403, "Account suspended. Contact support.")
    token = make_token(user["id"], user["role"], int(user.get("token_version", 0)))
    user.pop("password_hash", None); user.pop("_id", None)
    return {"token": token, "user": user}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)): return user


@api.put("/auth/me")
async def update_me(inp: ProfileUpdate, user: dict = Depends(get_current_user)):
    patch = {k: v for k, v in inp.model_dump().items() if v is not None}
    if patch: await db.users.update_one({"id": user["id"]}, {"$set": patch})
    return await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})


@api.post("/auth/reset-password")
async def reset_password(inp: ResetPasswordInput):
    email = inp.email.lower().strip()
    await _consume_otp_token(inp.otp_token, email, "password_reset")
    result = await db.users.update_one(
        {"email": email},
        {
            "$set": {"password_hash": hash_pw(inp.new_password)},
            "$inc": {"token_version": 1},  # invalidate existing sessions
        },
    )
    if result.matched_count == 0:
        # Same generic message — token already consumed so don't leak
        raise HTTPException(400, "Unable to reset password")
    return {"reset": True}


# ─── Debug (non-production) ─────────────────────────────────────────────────
@api.post("/debug/test-email")
async def debug_test_email(inp: TestEmailInput):
    if APP_ENV == "production":
        raise HTTPException(404, "Not found")
    if not email_configured():
        raise HTTPException(503, "Email provider not configured. Set RESEND_API_KEY in backend/.env")
    result = await email_service.send_test_email(inp.email.lower().strip())
    if result.get("status") != "sent":
        raise HTTPException(502, f"Email delivery failed: {result.get('error', 'unknown')}")
    return {"sent": True, "to": inp.email, "provider": result.get("provider")}


# ─── Categories ─────────────────────────────────────────────────────────────
@api.get("/categories")
async def list_categories():
    return await db.categories.find({}, {"_id": 0}).sort("sort_order", 1).to_list(200)


@api.post("/admin/categories")
async def create_category(inp: CategoryInput, _: dict = Depends(require_admin)):
    slug = inp.slug or slugify(inp.name)
    if await db.categories.find_one({"slug": slug}):
        raise HTTPException(400, "Slug already exists")
    if inp.banner_image_url:
        _validate_media_field(inp.banner_image_url, field="banner_image_url")
    doc = {"id": new_id(), "slug": slug, "name": inp.name,
           "banner_image_url": inp.banner_image_url, "sort_order": inp.sort_order,
           "created_at": now_iso()}
    await db.categories.insert_one(doc); doc.pop("_id", None)
    await _refresh_categories_cache()
    return doc


@api.put("/admin/categories/{cat_id}")
async def update_category(cat_id: str, inp: CategoryInput, _: dict = Depends(require_admin)):
    if inp.banner_image_url:
        _validate_media_field(inp.banner_image_url, field="banner_image_url")
    patch = inp.model_dump(exclude_unset=True)
    await db.categories.update_one({"id": cat_id}, {"$set": patch})
    await _refresh_categories_cache()
    return strip_id(await db.categories.find_one({"id": cat_id}))


@api.delete("/admin/categories/{cat_id}")
async def delete_category(cat_id: str, _: dict = Depends(require_admin)):
    from object_storage import delete_object_by_url
    cat = await db.categories.find_one({"id": cat_id})
    if not cat: raise HTTPException(404, "Category not found")
    cnt = await db.products.count_documents({"category_slug": cat["slug"]})
    if cnt > 0: raise HTTPException(400, "Reassign products before deleting")
    delete_object_by_url(cat.get("banner_image_url") or "")
    await db.categories.delete_one({"id": cat_id})
    return {"ok": True}


# ─── Products ───────────────────────────────────────────────────────────────
def _normalize_product_status(p: dict) -> str:
    s = str(p.get("status") or "ACTIVE").strip().upper().replace(" ", "_")
    return s if s in ("ACTIVE", "SOLD_OUT", "COMING_SOON") else "ACTIVE"


def _assert_product_purchasable(product: dict) -> None:
    status = _normalize_product_status(product)
    if status == "SOLD_OUT":
        raise HTTPException(400, "Sold out")
    if status == "COMING_SOON":
        raise HTTPException(400, "Coming soon")
    stock = int(product.get("stock_quantity") or 0)
    if stock < 1:
        raise HTTPException(400, "Out of stock")


def _compute_price(p: dict) -> dict:
    from media_validation import sanitize_product_media

    p = sanitize_product_media(p, _categories_by_slug, verify_remote=False)
    disc = float(p.get("discount_percent") or 0)
    price = float(p["price"])
    final = round(price * (1 - disc / 100), 2) if disc else price
    p["final_price"] = final
    p["has_discount"] = disc > 0
    p["status"] = _normalize_product_status(p)
    try:
        p["stock_quantity"] = max(0, int(p.get("stock_quantity") or 0))
    except (TypeError, ValueError):
        p["stock_quantity"] = 0
    return p


@api.get("/products")
async def list_products(category: Optional[str] = None, q: Optional[str] = None,
                        sort: str = "newest", featured: Optional[bool] = None,
                        trending: Optional[bool] = None, best_seller: Optional[bool] = None,
                        limit: int = 60):
    query: dict = {"visibility": "published"}
    if category: query["category_slug"] = category
    if featured: query["is_featured"] = True
    if trending: query["is_trending"] = True
    if best_seller: query["is_best_seller"] = True
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"category_slug": {"$regex": q, "$options": "i"}},
        ]
    sort_key = {"newest": [("created_at", -1)], "price_asc": [("price", 1)],
                "price_desc": [("price", -1)],
                "popularity": [("is_best_seller", -1), ("created_at", -1)]}.get(sort, [("created_at", -1)])
    cur = db.products.find(query, {"_id": 0}).sort(sort_key).limit(limit)
    return [_compute_price(p) async for p in cur]


@api.get("/products/{slug}")
async def get_product(slug: str):
    p = await db.products.find_one({"slug": slug}, {"_id": 0})
    if not p: raise HTTPException(404, "Product not found")
    return _compute_price(p)


@api.get("/admin/products")
async def admin_list_products(_: dict = Depends(require_admin)):
    items = await db.products.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_compute_price(p) for p in items]


@api.post("/admin/products")
async def create_product(inp: ProductInput, admin: dict = Depends(require_admin)):
    _validate_product_media(inp)
    slug = inp.slug or slugify(inp.name)
    if await db.products.find_one({"slug": slug}):
        slug = f"{slug}-{new_id()[:4]}"
    doc = inp.model_dump()
    doc.update({"id": new_id(), "slug": slug,
                "created_at": now_iso(), "updated_at": now_iso()})
    await db.products.insert_one(doc)
    await _log(admin, "product_created", "product", doc["id"], None, doc["name"])
    return _compute_price(strip_id(doc))


@api.put("/admin/products/{pid}")
async def update_product(pid: str, inp: ProductInput, admin: dict = Depends(require_admin)):
    existing = await db.products.find_one({"id": pid})
    if not existing: raise HTTPException(404, "Not found")
    _validate_product_media(inp)
    patch = inp.model_dump(exclude_unset=True)
    patch["updated_at"] = now_iso()
    await db.products.update_one({"id": pid}, {"$set": patch})
    # Restock trigger: if stock went from 0 → >0, fire restock alerts
    if existing.get("stock_quantity", 0) <= 0 and patch.get("stock_quantity", 0) > 0:
        asyncio.create_task(_fire_restock_alerts(pid))
    await _log(admin, "product_updated", "product", pid, existing.get("name"), patch.get("name", existing.get("name")))
    return _compute_price(strip_id(await db.products.find_one({"id": pid})))


@api.patch("/admin/products/{pid}/status")
async def update_product_status(pid: str, inp: ProductStatusInput, admin: dict = Depends(require_admin)):
    existing = await db.products.find_one({"id": pid})
    if not existing:
        raise HTTPException(404, "Not found")
    await db.products.update_one(
        {"id": pid},
        {"$set": {"status": inp.status, "updated_at": now_iso()}},
    )
    await _log(admin, "product_status_change", "product", pid, existing.get("status", "ACTIVE"), inp.status)
    return _compute_price(strip_id(await db.products.find_one({"id": pid})))


@api.delete("/admin/products/{pid}")
async def delete_product(pid: str, admin: dict = Depends(require_admin)):
    from object_storage import delete_urls
    p = await db.products.find_one({"id": pid})
    if p:
        urls = list(p.get("images") or [])
        if p.get("lifestyle_image"):
            urls.append(p["lifestyle_image"])
        delete_urls(urls)
        await _log(admin, "product_deleted", "product", pid, p.get("name"), None)
    await db.products.delete_one({"id": pid})
    return {"ok": True}


# ─── Image upload (admin + payment proofs) ──────────────────────────────────
async def _save_validated_image(file: UploadFile, *, subdir: str = "products") -> str:
    """Validate image and store in Supabase Storage (or local disk in development).

    Returns a permanent public HTTPS URL when Supabase is configured.
    Never relies on Render's ephemeral filesystem in production.
    """
    from object_storage import normalize_folder, put_bytes, unique_object_key

    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 8MB)")
    ext = detect_image(content)
    if not ext:
        raise HTTPException(400, "Only JPEG, PNG, WebP, or GIF images are allowed")
    if file.content_type and file.content_type not in ALLOWED_IMAGE_MIME and file.content_type != "application/octet-stream":
        if not file.content_type.startswith("image/"):
            raise HTTPException(400, "Only image uploads are allowed")

    folder = normalize_folder(subdir or "products")
    key = unique_object_key(ext, folder=folder)
    try:
        return put_bytes(content, key)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        log.exception("Image upload failed")
        raise HTTPException(500, f"Upload failed: {e}")


@api.post("/admin/upload")
async def upload_file(
    file: UploadFile = File(...),
    folder: str = "products",
    _: dict = Depends(require_admin),
):
    """Upload media to Supabase. Optional folder: products|gallery|hero|categories|payments|testimonials|misc."""
    url = await _save_validated_image(file, subdir=folder)
    return {"url": url}


@api.post("/admin/migrate-media-to-supabase")
async def admin_migrate_media_to_supabase(_: dict = Depends(require_admin)):
    """One-shot: upload local uploads/ (if present) + rewrite Mongo /uploads/ refs to Supabase public URLs.

    Safe to re-run (stable keys + upsert). Uses SUPABASE_* env already configured on the host.
    """
    from object_storage import storage_configured
    from migrate_media_to_supabase import migrate

    if not storage_configured():
        raise HTTPException(
            503,
            "Supabase Storage is not configured on this host "
            "(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET).",
        )
    report = await migrate(db)
    return report


@api.post("/orders/{order_id}/upload-payment-proof")
async def upload_payment_proof(
    order_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    order = await db.orders.find_one({"id": order_id, "user_id": user["id"]})
    if not order:
        raise HTTPException(404, "Order not found")
    if order["status"] not in ("placed", "payment_under_validation"):
        raise HTTPException(400, "Order not accepting payment proof")
    url = await _save_validated_image(file, subdir="payments")
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"payment_screenshot_url": url, "updated_at": now_iso()}},
    )
    return {"url": url}


# ─── Cart ───────────────────────────────────────────────────────────────────
async def _fetch_cart(user_id: str) -> dict:
    items = await db.carts.find({"user_id": user_id}, {"_id": 0}).to_list(200)
    subtotal = 0.0; discount_total = 0.0; detailed = []
    for it in items:
        p = await db.products.find_one({"id": it["product_id"]}, {"_id": 0})
        if not p: continue
        p = _compute_price(p)
        line_total = p["final_price"] * it["quantity"]
        subtotal += p["price"] * it["quantity"]
        discount_total += (p["price"] - p["final_price"]) * it["quantity"]
        detailed.append({"product_id": p["id"], "quantity": it["quantity"],
                         "product": p, "line_total": round(line_total, 2)})
    return {"items": detailed, "subtotal": round(subtotal, 2),
            "discount_total": round(discount_total, 2), "delivery": 0.0,
            "total": round(subtotal - discount_total, 2)}


@api.get("/cart")
async def get_cart(user: dict = Depends(get_current_user)):
    return await _fetch_cart(user["id"])


@api.post("/cart")
async def add_to_cart(inp: CartItemInput, user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"id": inp.product_id, "visibility": "published"})
    if not product:
        raise HTTPException(404, "Product not found")
    _assert_product_purchasable(product)
    stock = int(product.get("stock_quantity") or 0)
    qty = max(1, int(inp.quantity or 1))
    existing = await db.carts.find_one({"user_id": user["id"], "product_id": inp.product_id})
    current_qty = int(existing["quantity"]) if existing else 0
    if current_qty + qty > stock:
        raise HTTPException(400, f"Only {stock} in stock")
    if existing:
        await db.carts.update_one({"_id": existing["_id"]},
                                  {"$inc": {"quantity": qty},
                                   "$set": {"updated_at": now_iso()}})
    else:
        await db.carts.insert_one({"id": new_id(), "user_id": user["id"],
                                   "product_id": inp.product_id, "quantity": qty,
                                   "updated_at": now_iso()})
    return await _fetch_cart(user["id"])


@api.put("/cart/{product_id}")
async def update_cart(product_id: str, inp: CartItemInput, user: dict = Depends(get_current_user)):
    if inp.quantity <= 0:
        await db.carts.delete_one({"user_id": user["id"], "product_id": product_id})
    else:
        product = await db.products.find_one({"id": product_id, "visibility": "published"})
        if not product:
            raise HTTPException(404, "Product not found")
        _assert_product_purchasable(product)
        stock = int(product.get("stock_quantity") or 0)
        if inp.quantity > stock:
            raise HTTPException(400, "Out of stock" if stock < 1 else f"Only {stock} in stock")
        await db.carts.update_one({"user_id": user["id"], "product_id": product_id},
                                  {"$set": {"quantity": inp.quantity, "updated_at": now_iso()}},
                                  upsert=True)
    return await _fetch_cart(user["id"])


@api.delete("/cart/{product_id}")
async def remove_from_cart(product_id: str, user: dict = Depends(get_current_user)):
    await db.carts.delete_one({"user_id": user["id"], "product_id": product_id})
    return await _fetch_cart(user["id"])


# ─── Wishlist ───────────────────────────────────────────────────────────────
@api.get("/wishlist")
async def get_wishlist(user: dict = Depends(get_current_user)):
    items = await db.wishlists.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    products = []
    for it in items:
        p = await db.products.find_one({"id": it["product_id"]}, {"_id": 0})
        if p: products.append(_compute_price(p))
    return products


@api.post("/wishlist/{product_id}")
async def toggle_wishlist(product_id: str, user: dict = Depends(get_current_user)):
    existing = await db.wishlists.find_one({"user_id": user["id"], "product_id": product_id})
    if existing:
        await db.wishlists.delete_one({"_id": existing["_id"]})
        return {"wishlisted": False}
    await db.wishlists.insert_one({"id": new_id(), "user_id": user["id"],
                                   "product_id": product_id, "created_at": now_iso()})
    return {"wishlisted": True}


# ─── Orders ─────────────────────────────────────────────────────────────────
async def _next_order_number() -> str:
    year = datetime.now(timezone.utc).year
    counter = await db.counters.find_one_and_update(
        {"_id": f"order-{year}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = counter["seq"] if counter else 1
    return f"PL-{year}-{seq:05d}"


@api.post("/orders/checkout")
async def checkout(inp: CheckoutInput, user: dict = Depends(get_current_user)):
    cart = await _fetch_cart(user["id"])
    if not cart["items"]: raise HTTPException(400, "Cart is empty")
    # Stock / status check before creating order
    for it in cart["items"]:
        p = it["product"]
        status = _normalize_product_status(p)
        if status == "SOLD_OUT":
            raise HTTPException(400, f"{p.get('name', 'Item')} is sold out")
        if status == "COMING_SOON":
            raise HTTPException(400, f"{p.get('name', 'Item')} is coming soon")
        stock = int(p.get("stock_quantity") or 0)
        if stock < it["quantity"]:
            raise HTTPException(400, f"Insufficient stock for {p.get('name', 'item')}")
    order_id = new_id()
    customer_name = (inp.customer_name or user.get("name") or "").strip()
    customer_email = str(inp.email or user.get("email") or "")
    phone = inp.phone.strip()

    order = {
        "id": order_id,
        "order_number": await _next_order_number(),
        "user_id": user["id"],
        "delivery_type": inp.delivery_type,
        "customer_name": customer_name,
        "customer_email": customer_email,
        "phone": phone,
        "items": [{
            "product_id": it["product_id"],
            "product_name": it["product"]["name"],
            "product_image": (it["product"].get("images") or [None])[0],
            "product_slug": it["product"]["slug"],
            "unit_price": it["product"]["price"],
            "final_price": it["product"]["final_price"],
            "quantity": it["quantity"],
            "line_total": it["line_total"],
        } for it in cart["items"]],
        "subtotal": cart["subtotal"], "discount_total": cart["discount_total"],
        "delivery": 0.0, "total": cart["total"],
        "status": "placed", "payment_status": "pending",
        "transaction_id": None, "payment_screenshot_url": None, "delivery_date": None,
        "order_note": inp.order_note,
        "reservation_expires_at": (datetime.now(timezone.utc) + timedelta(minutes=45)).isoformat(),
        "timeline": [{"status": "placed", "at": now_iso(), "note": "Order placed"}],
        "created_at": now_iso(), "updated_at": now_iso(),
    }

    if inp.delivery_type == "woxsen_university":
        tower = inp.tower.strip()
        room = inp.room_number.strip()
        instructions = (inp.delivery_instructions or "").strip()
        order.update({
            "tower": tower,
            "room_number": room,
            "delivery_instructions": instructions or None,
            "address_line1": "Woxsen University",
            "address_line2": f"Tower: {tower}, Room: {room}",
            "address_line3": None,
            "landmark": None,
            "city": "Woxsen University Campus",
            "state": "Telangana",
            "pincode": "",
            "country": "India",
        })
    else:
        order.update({
            "tower": None,
            "room_number": None,
            "delivery_instructions": None,
            "address_line1": inp.address_line1.strip(),
            "address_line2": (inp.address_line2 or "").strip() or None,
            "address_line3": (inp.address_line3 or "").strip() or None,
            "landmark": (inp.landmark or "").strip() or None,
            "city": inp.city.strip(),
            "state": inp.state.strip(),
            "pincode": inp.pincode.strip(),
            "country": (inp.country or "India").strip() or "India",
        })
    await db.orders.insert_one(order)
    for it in cart["items"]:
        result = await db.products.update_one(
            {"id": it["product_id"], "stock_quantity": {"$gte": it["quantity"]}},
            {"$inc": {"stock_quantity": -it["quantity"]}},
        )
        if result.modified_count == 0:
            # Rollback: cancel order & restore any decremented stock
            await db.orders.update_one({"id": order_id}, {"$set": {"status": "cancelled"}})
            raise HTTPException(400, f"Insufficient stock for {it['product']['name']}")
    await db.carts.delete_many({"user_id": user["id"]})
    asyncio.create_task(email_service.send_order_confirmation(
        user["email"],
        user["name"],
        order["order_number"],
        order["total"],
        [{"name": it["product_name"], "quantity": it["quantity"], "line_total": it["line_total"]}
         for it in order["items"]],
    ))
    asyncio.create_task(email_service.send_admin_notification(
        ADMIN_EMAIL,
        f"New order {order['order_number']}",
        f"<p>Customer: <b>{user['name']}</b> ({user['email']})</p>"
        f"<p>Total: <b>₹{order['total']:,.0f}</b></p>",
        f"New order {order['order_number']} from {user['email']} — ₹{order['total']:,.0f}",
    ))
    return strip_id(order)


@api.post("/orders/{order_id}/submit-payment")
async def submit_payment(order_id: str, inp: SubmitPaymentInput, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id, "user_id": user["id"]})
    if not order: raise HTTPException(404, "Order not found")
    if order["status"] not in ("placed", "payment_under_validation"):
        raise HTTPException(400, "Order not accepting payment update")
    txn = re.sub(r"[^A-Za-z0-9\-]", "", inp.transaction_id.strip())[:64]
    if len(txn) < 6:
        raise HTTPException(400, "Enter a valid transaction ID")
    screenshot = (inp.payment_screenshot_url or order.get("payment_screenshot_url") or "").strip()
    if not screenshot:
        raise HTTPException(400, "Payment screenshot is required")
    from object_storage import is_allowed_media_url
    if not is_allowed_media_url(screenshot):
        raise HTTPException(400, "Invalid payment screenshot URL")
    paid_at = now_iso()
    patch = {
        "transaction_id": txn,
        "payment_screenshot_url": screenshot,
        "status": "payment_under_validation",
        "payment_status": "under_validation",
        "payment_submitted_at": paid_at,
        "updated_at": paid_at,
    }
    await db.orders.update_one({"id": order_id}, {
        "$set": patch,
        "$push": {"timeline": {"status": "payment_under_validation",
                                "at": paid_at,
                                "note": f"Payment submitted · Transaction {txn}"}},
    })
    return strip_id(await db.orders.find_one({"id": order_id}))


@api.get("/orders")
async def my_orders(user: dict = Depends(get_current_user)):
    return await db.orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    q = {"id": order_id}
    if user.get("role") != "admin": q["user_id"] = user["id"]
    order = await db.orders.find_one(q, {"_id": 0})
    if not order: raise HTTPException(404, "Order not found")
    return order


@api.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id, "user_id": user["id"]})
    if not order: raise HTTPException(404, "Order not found")
    if order["status"] not in ("placed", "payment_under_validation"):
        raise HTTPException(400, "Order cannot be cancelled at this stage")
    await db.orders.update_one({"id": order_id}, {
        "$set": {"status": "cancelled", "updated_at": now_iso(), "cancelled_at": now_iso()},
        "$push": {"timeline": {"status": "cancelled", "at": now_iso(), "note": "Cancelled by customer"}},
    })
    for it in order["items"]:
        await db.products.update_one({"id": it["product_id"]},
                                     {"$inc": {"stock_quantity": it["quantity"]}})
    return strip_id(await db.orders.find_one({"id": order_id}))


# ─── Admin: Orders ──────────────────────────────────────────────────────────
@api.get("/admin/orders")
async def admin_list_orders(_: dict = Depends(require_admin),
                            status: Optional[str] = None,
                            q: Optional[str] = None):
    query: dict = {"is_deleted": {"$ne": True}}
    if status: query["status"] = status
    if q:
        query["$or"] = [
            {"order_number": {"$regex": q, "$options": "i"}},
            {"customer_email": {"$regex": q, "$options": "i"}},
            {"customer_name": {"$regex": q, "$options": "i"}},
            {"transaction_id": {"$regex": q, "$options": "i"}},
        ]
    return await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.delete("/admin/orders/{order_id}")
async def admin_soft_delete_order(order_id: str, admin: dict = Depends(require_admin)):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(404, "Order not found")
    if order.get("is_deleted"):
        return {"ok": True}
    await db.orders.update_one({"id": order_id}, {
        "$set": {"is_deleted": True, "deleted_at": now_iso(), "updated_at": now_iso()},
    })
    await _log(admin, "order_soft_deleted", "order", order_id, order.get("order_number"), None)
    return {"ok": True}


@api.put("/admin/orders/{order_id}/status")
async def admin_update_status(order_id: str, inp: UpdateOrderStatusInput,
                              admin: dict = Depends(require_admin)):
    order = await db.orders.find_one({"id": order_id})
    if not order: raise HTTPException(404, "Order not found")
    new_status = inp.status
    if new_status == "cancelled":
        if order["status"] != "cancelled":
            for it in order["items"]:
                await db.products.update_one({"id": it["product_id"]},
                                             {"$inc": {"stock_quantity": it["quantity"]}})
    else:
        if order["status"] in ORDER_FLOW and new_status in ORDER_FLOW:
            if ORDER_FLOW.index(new_status) < ORDER_FLOW.index(order["status"]):
                raise HTTPException(400, "Cannot move order backward")
    payment_status = order.get("payment_status", "pending")
    if new_status == "approved":
        payment_status = "verified"
    await db.orders.update_one({"id": order_id}, {
        "$set": {"status": new_status, "payment_status": payment_status, "updated_at": now_iso()},
        "$push": {"timeline": {"status": new_status, "at": now_iso(),
                                "note": inp.note or "", "by": admin["email"]}},
    })
    await _log(admin, "order_status_change", "order", order_id, order["status"], new_status)
    # Notify customer
    asyncio.create_task(email_service.send(order["customer_email"],
        f"Order update: {order['order_number']} is now {new_status.replace('_', ' ').title()}",
        f"<p>Your order <b>{order['order_number']}</b> moved to <b>{new_status.replace('_', ' ').title()}</b>.</p>"))
    return strip_id(await db.orders.find_one({"id": order_id}))


@api.put("/admin/orders/{order_id}/delivery-date")
async def admin_set_delivery(order_id: str, inp: SetDeliveryDateInput,
                             _: dict = Depends(require_admin)):
    await db.orders.update_one({"id": order_id},
                               {"$set": {"delivery_date": inp.delivery_date, "updated_at": now_iso()}})
    return strip_id(await db.orders.find_one({"id": order_id}))


@api.post("/admin/orders/{order_id}/approve-payment")
async def admin_approve_payment(order_id: str, inp: PaymentDecisionInput,
                                admin: dict = Depends(require_admin)):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(404, "Order not found")
    if order["status"] not in ("placed", "payment_under_validation"):
        raise HTTPException(400, "Order is not awaiting payment verification")
    delivery_date = (inp.delivery_date or "").strip()
    if not delivery_date:
        raise HTTPException(400, "Expected delivery date is required to approve payment")
    now = now_iso()
    await db.orders.update_one({"id": order_id}, {
        "$set": {
            "status": "preparing",
            "payment_status": "verified",
            "delivery_date": delivery_date,
            "payment_verified_at": now,
            "updated_at": now,
        },
        "$push": {"timeline": {"$each": [
            {
                "status": "approved",
                "at": now,
                "note": inp.note or "Payment verified. Your order is now being prepared.",
                "by": admin["email"],
            },
            {
                "status": "preparing",
                "at": now,
                "note": f"Preparing order · Expected delivery {delivery_date[:10]}",
                "by": admin["email"],
            },
        ]}},
    })
    await _log(admin, "payment_approved", "order", order_id, order.get("payment_status"), "verified")
    asyncio.create_task(email_service.send(
        order["customer_email"],
        f"Payment Approved — {order['order_number']}",
        f"<p>Payment verified for <b>{order['order_number']}</b>.</p>"
        f"<p>Your order is now being prepared. Expected delivery: <b>{delivery_date[:10]}</b>.</p>",
    ))
    return strip_id(await db.orders.find_one({"id": order_id}))


@api.post("/admin/orders/{order_id}/reject-payment")
async def admin_reject_payment(order_id: str, inp: PaymentDecisionInput,
                               admin: dict = Depends(require_admin)):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(404, "Order not found")
    if order["status"] not in ("placed", "payment_under_validation"):
        raise HTTPException(400, "Order is not awaiting payment verification")
    reject_note = inp.note or "Payment could not be verified. Please contact support."
    await db.orders.update_one({"id": order_id}, {
        "$set": {
            "status": "placed",
            "payment_status": "rejected",
            "updated_at": now_iso(),
        },
        "$push": {"timeline": {
            "status": "placed",
            "at": now_iso(),
            "note": reject_note,
            "by": admin["email"],
        }},
    })
    await _log(admin, "payment_rejected", "order", order_id, order.get("payment_status"), "rejected")
    asyncio.create_task(email_service.send(
        order["customer_email"],
        f"Payment Rejected — {order['order_number']}",
        f"<p>Payment for <b>{order['order_number']}</b> could not be verified.</p>"
        f"<p>{reject_note}</p><p>Please open your order and use <b>Retry Payment</b>, or contact support.</p>",
    ))
    return strip_id(await db.orders.find_one({"id": order_id}))


# ─── Admin: Customers ───────────────────────────────────────────────────────
@api.get("/admin/customers")
async def admin_list_customers(_: dict = Depends(require_admin), q: Optional[str] = None):
    query: dict = {"role": "customer"}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
        ]
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    for u in users:
        orders = await db.orders.find({"user_id": u["id"]}, {"_id": 0}).to_list(500)
        u["order_count"] = len(orders)
        u["total_spent"] = round(sum(o.get("total", 0) for o in orders if o.get("status") != "cancelled"), 2)
    return users


@api.put("/admin/customers/{user_id}/block")
async def admin_block_customer(user_id: str, admin: dict = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id})
    if not user or user.get("role") == "admin":
        raise HTTPException(404, "Customer not found")
    if user.get("email", "").lower() == ADMIN_EMAIL:
        raise HTTPException(400, "Cannot block the primary admin account")
    blocked = not user.get("is_blocked", False)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_blocked": blocked}, "$inc": {"token_version": 1}},
    )
    await _log(admin, "customer_block" if blocked else "customer_unblock", "user", user_id, not blocked, blocked)
    return strip_id(await db.users.find_one({"id": user_id}, {"password_hash": 0}))


# ─── Newsletter, Restock, Testimonials, Gallery, Discounts ──────────────────
@api.post("/newsletter/subscribe")
async def newsletter_subscribe(inp: NewsletterInput):
    existing = await db.newsletter.find_one({"email": inp.email.lower()})
    if not existing:
        await db.newsletter.insert_one({"id": new_id(), "email": inp.email.lower(),
                                         "source": inp.source, "created_at": now_iso()})
    return {"subscribed": True}


@api.post("/restock-alert")
async def restock_alert(inp: RestockAlertInput):
    exists = await db.restock_alerts.find_one({"email": inp.email.lower(), "product_id": inp.product_id, "notified": False})
    if not exists:
        await db.restock_alerts.insert_one({
            "id": new_id(), "email": inp.email.lower(), "product_id": inp.product_id,
            "notified": False, "created_at": now_iso(),
        })
    return {"ok": True}


async def _fire_restock_alerts(product_id: str):
    p = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not p: return
    alerts = await db.restock_alerts.find({"product_id": product_id, "notified": False}).to_list(500)
    for a in alerts:
        await email_service.send(a["email"], f"Back in stock: {p['name']}",
            f"<p><b>{p['name']}</b> is restocked. Grab yours before it disappears again.</p>")
        await db.restock_alerts.update_one({"_id": a["_id"]}, {"$set": {"notified": True, "notified_at": now_iso()}})


@api.get("/testimonials")
async def list_testimonials():
    """Public reviews/testimonials — newest first, hidden excluded."""
    return await db.testimonials.find(
        {"hidden": {"$ne": True}}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)


@api.get("/admin/testimonials")
async def admin_list_testimonials(_: dict = Depends(require_admin)):
    return await db.testimonials.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.post("/admin/testimonials")
async def create_testimonial(inp: TestimonialInput, _: dict = Depends(require_admin)):
    if inp.photo_url:
        _validate_media_field(inp.photo_url, field="photo_url")
    doc = inp.model_dump()
    doc.update({
        "id": new_id(),
        "created_at": now_iso(),
        "verified_purchase": False,
        "hidden": bool(doc.get("hidden")),
    })
    await db.testimonials.insert_one(doc)
    doc.pop("_id", None)
    return doc


class ReviewVisibilityInput(BaseModel):
    hidden: bool = True


@api.put("/admin/testimonials/{tid}/visibility")
async def set_testimonial_visibility(tid: str, inp: ReviewVisibilityInput, _: dict = Depends(require_admin)):
    result = await db.testimonials.update_one(
        {"id": tid}, {"$set": {"hidden": inp.hidden, "updated_at": now_iso()}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Review not found")
    return strip_id(await db.testimonials.find_one({"id": tid}))


@api.delete("/admin/testimonials/{tid}")
async def delete_testimonial(tid: str, _: dict = Depends(require_admin)):
    from object_storage import delete_object_by_url
    t = await db.testimonials.find_one({"id": tid})
    if t:
        delete_object_by_url(t.get("photo_url") or "")
    await db.testimonials.delete_one({"id": tid})
    return {"ok": True}


async def _user_has_purchase(user_id: str) -> bool:
    """True if customer completed a real purchase (paid / delivered)."""
    found = await db.orders.find_one({
        "user_id": user_id,
        "status": {"$ne": "cancelled"},
        "$or": [
            {"payment_status": "verified"},
            {"status": {"$in": ["approved", "preparing", "packed", "out_for_delivery", "delivered"]}},
        ],
    }, {"_id": 1})
    return found is not None


@api.post("/reviews")
async def create_review(inp: ReviewInput, user: dict = Depends(get_current_user)):
    if user.get("role") == "admin":
        raise HTTPException(400, "Admins cannot post customer reviews")
    if not await _user_has_purchase(user["id"]):
        raise HTTPException(403, "Only customers with a completed purchase can leave a review")
    existing = await db.testimonials.find_one({"user_id": user["id"]})
    if existing:
        raise HTTPException(400, "You have already submitted a review")
    doc = {
        "id": new_id(),
        "user_id": user["id"],
        "name": user.get("name") or "Customer",
        "title": inp.title.strip(),
        "quote": inp.quote.strip(),
        "location": "",
        "photo_url": (inp.photo_url or "").strip(),
        "rating": int(inp.rating),
        "product_id": inp.product_id,
        "verified_purchase": True,
        "hidden": False,
        "created_at": now_iso(),
    }
    await db.testimonials.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/gallery")
async def list_gallery():
    return await db.gallery_items.find({}, {"_id": 0}).sort("sort_order", 1).to_list(60)


@api.post("/admin/gallery")
async def create_gallery(inp: GalleryItemInput, _: dict = Depends(require_admin)):
    _validate_media_field(inp.image_url, field="image_url", required=True)
    doc = inp.model_dump()
    doc.update({"id": new_id(), "created_at": now_iso()})
    await db.gallery_items.insert_one(doc); doc.pop("_id", None); return doc


@api.delete("/admin/gallery/{gid}")
async def delete_gallery(gid: str, _: dict = Depends(require_admin)):
    from object_storage import delete_object_by_url
    g = await db.gallery_items.find_one({"id": gid})
    if g:
        delete_object_by_url(g.get("image_url") or "")
    await db.gallery_items.delete_one({"id": gid})
    return {"ok": True}


@api.get("/admin/discounts")
async def admin_list_discounts(_: dict = Depends(require_admin)):
    return await db.discounts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.post("/admin/discounts")
async def create_discount(inp: DiscountInput, admin: dict = Depends(require_admin)):
    doc = inp.model_dump(); doc.update({"id": new_id(), "created_at": now_iso()})
    await db.discounts.insert_one(doc)
    # Optionally apply directly to products/category
    if inp.is_active and inp.type == "percent":
        if inp.applies_to == "product" and inp.target_slug:
            await db.products.update_one({"slug": inp.target_slug}, {"$set": {"discount_percent": inp.value}})
        elif inp.applies_to == "category" and inp.target_slug:
            await db.products.update_many({"category_slug": inp.target_slug}, {"$set": {"discount_percent": inp.value}})
        elif inp.applies_to == "all":
            await db.products.update_many({}, {"$set": {"discount_percent": inp.value}})
    await _log(admin, "discount_created", "discount", doc["id"], None, inp.name)
    doc.pop("_id", None); return doc


@api.delete("/admin/discounts/{did}")
async def delete_discount(did: str, admin: dict = Depends(require_admin)):
    d = await db.discounts.find_one({"id": did})
    # Only reset prices if this discount was actually active AND currently applied
    if d and d.get("is_active"):
        if d.get("applies_to") == "product" and d.get("target_slug"):
            await db.products.update_one(
                {"slug": d["target_slug"], "discount_percent": d.get("value")},
                {"$set": {"discount_percent": 0}},
            )
        elif d.get("applies_to") == "category" and d.get("target_slug"):
            await db.products.update_many(
                {"category_slug": d["target_slug"], "discount_percent": d.get("value")},
                {"$set": {"discount_percent": 0}},
            )
        elif d.get("applies_to") == "all":
            await db.products.update_many(
                {"discount_percent": d.get("value")},
                {"$set": {"discount_percent": 0}},
            )
    await db.discounts.delete_one({"id": did})
    if d: await _log(admin, "discount_deleted", "discount", did, d.get("name"), None)
    return {"ok": True}


# ─── Activity Log ───────────────────────────────────────────────────────────
async def _log(admin: dict, action: str, entity_type: str, entity_id: str, before, after):
    await db.activity_log.insert_one({
        "id": new_id(), "admin_id": admin["id"], "admin_email": admin["email"],
        "action_type": action, "entity_type": entity_type, "entity_id": entity_id,
        "before_value": before, "after_value": after, "created_at": now_iso(),
    })


@api.get("/admin/activity")
async def admin_activity(_: dict = Depends(require_admin), limit: int = 100):
    return await db.activity_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)


# ─── Settings ───────────────────────────────────────────────────────────────
def _default_settings() -> dict:
    return default_settings()


async def _get_settings() -> dict:
    s = await db.settings.find_one({"key": "site"}, {"_id": 0})
    if not s:
        s = {"key": "site", **_default_settings()}
        await db.settings.insert_one(s); s.pop("_id", None)
    return s


@api.get("/settings")
async def get_settings():
    return await _get_settings()


@api.put("/admin/settings")
async def update_settings(inp: SettingsUpdate, admin: dict = Depends(require_admin)):
    patch = {k: v for k, v in inp.model_dump().items() if v is not None}
    for field in ("logo_url", "hero_background_url", "gpay_qr_url"):
        if field in patch and patch[field]:
            _validate_media_field(patch[field], field=field)
    if patch.get("hero_images"):
        for i, u in enumerate(patch["hero_images"]):
            if u:
                _validate_media_field(u, field=f"hero_images[{i}]")
    if patch:
        await db.settings.update_one({"key": "site"}, {"$set": patch}, upsert=True)
        await _log(admin, "settings_updated", "settings", "site", None, list(patch.keys()))
    return await _get_settings()


# ─── Admin: Analytics ───────────────────────────────────────────────────────
@api.get("/admin/analytics")
async def admin_analytics(_: dict = Depends(require_admin)):
    orders = await db.orders.find({"is_deleted": {"$ne": True}}, {"_id": 0}).to_list(2000)
    total_revenue = sum(o.get("total", 0) for o in orders if o.get("status") == "delivered")
    all_revenue = sum(o.get("total", 0) for o in orders if o.get("status") != "cancelled")
    pending = sum(1 for o in orders if o.get("status") in ("placed", "payment_under_validation"))
    approved = sum(1 for o in orders if o.get("status") in ("approved", "preparing", "packed", "out_for_delivery"))
    delivered = sum(1 for o in orders if o.get("status") == "delivered")
    cancelled = sum(1 for o in orders if o.get("status") == "cancelled")
    product_count = await db.products.count_documents({})
    customer_count = await db.users.count_documents({"role": "customer"})
    newsletter_count = await db.newsletter.count_documents({})

    counts: dict = {}
    for o in orders:
        if o.get("status") == "cancelled": continue
        for it in o.get("items", []):
            counts[it["product_id"]] = counts.get(it["product_id"], 0) + it["quantity"]
    top = sorted(counts.items(), key=lambda x: -x[1])[:5]
    top_products = []
    for pid, qty in top:
        p = await db.products.find_one({"id": pid}, {"_id": 0, "name": 1, "images": 1, "id": 1, "price": 1})
        if p: top_products.append({**p, "sold": qty})

    # 14-day revenue series
    today = datetime.now(timezone.utc).date()
    days = [(today - timedelta(days=i)) for i in range(13, -1, -1)]
    daily = {d.isoformat(): 0.0 for d in days}
    for o in orders:
        if o.get("status") == "cancelled": continue
        try:
            d = datetime.fromisoformat(o["created_at"]).date().isoformat()
            if d in daily: daily[d] += float(o.get("total", 0))
        except Exception: pass
    series = [{"date": k, "revenue": round(v, 2)} for k, v in daily.items()]

    # Category breakdown
    cat_counts: dict = {}
    for o in orders:
        if o.get("status") == "cancelled": continue
        for it in o.get("items", []):
            p = await db.products.find_one({"id": it["product_id"]}, {"_id": 0, "category_slug": 1})
            if p:
                cat_counts[p["category_slug"]] = cat_counts.get(p["category_slug"], 0) + it["quantity"]

    return {
        "total_revenue": round(all_revenue, 2),
        "delivered_revenue": round(total_revenue, 2),
        "order_counts": {"pending": pending, "approved": approved, "delivered": delivered,
                         "cancelled": cancelled, "total": len(orders)},
        "product_count": product_count,
        "customer_count": customer_count,
        "newsletter_count": newsletter_count,
        "top_products": top_products,
        "revenue_series": series,
        "category_breakdown": [{"name": k, "value": v} for k, v in cat_counts.items()],
    }


# ─── Seed ───────────────────────────────────────────────────────────────────
async def _seed_products_and_assets():
    """Copy Images/ assets to uploads/ and insert real products."""
    images_dir = ROOT_DIR.parent / "Images"
    if not images_dir.exists():
        log.warning("Images/ folder not found — skipping product seed")
        return
    try:
        copy_all_assets()
    except FileNotFoundError as e:
        log.error("Asset copy failed: %s", e)
        return

    from object_storage import put_local_file, storage_configured

    def _media_url(filename: str, folder: str = "products") -> str:
        local = UPLOAD_DIR / filename
        if storage_configured() and local.is_file():
            try:
                return put_local_file(local, folder=folder, key_name=filename)
            except Exception:
                log.exception("Failed to push seed asset %s to object storage", filename)
        return upload_url(filename)

    for i, (name, slug, banner_file) in enumerate(CATEGORIES):
        banner = _media_url(banner_file, folder="categories")
        existing = await db.categories.find_one({"slug": slug})
        if not existing:
            await db.categories.insert_one({
                "id": new_id(), "name": name, "slug": slug,
                "banner_image_url": banner, "sort_order": i, "created_at": now_iso(),
            })
        elif not existing.get("banner_image_url") or "unsplash" in (existing.get("banner_image_url") or ""):
            await db.categories.update_one({"id": existing["id"]}, {"$set": {"banner_image_url": banner}})

    await db.products.delete_many({})
    for p in PRODUCTS:
        url = _media_url(p["filename"], folder="products")
        doc = {
            "id": new_id(), "slug": slugify(p["name"]), "name": p["name"],
            "description": p["description"], "category_slug": p["category_slug"],
            "price": p["price"], "discount_percent": p.get("discount_percent", 0),
            "stock_quantity": p.get("stock_quantity", 25),
            "status": p.get("status", "ACTIVE"),
            "images": [url], "lifestyle_image": url,
            "material": p.get("material", "Premium 250gsm matte paper"),
            "size": p.get("size", "A3 (11.7 x 16.5 in)"),
            "finish": p.get("finish", "Matte, museum-grade ink"),
            "is_featured": p.get("is_featured", False),
            "is_trending": p.get("is_trending", False),
            "is_best_seller": p.get("is_best_seller", False),
            "is_new": p.get("is_new", False),
            "is_limited": p.get("is_limited", False),
            "visibility": "published",
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.products.insert_one(doc)
    log.info("Seeded %d products from Images/", len(PRODUCTS))

    # Refresh site settings — prefer object-storage URLs when available
    defaults = default_settings()
    if storage_configured():
        hero_file = UPLOAD_DIR / "hero-background.png"
        if hero_file.is_file():
            try:
                hero = put_local_file(hero_file, folder="hero", key_name="hero-background.png")
                defaults["hero_background_url"] = hero
                defaults["hero_images"] = [hero]
            except Exception:
                log.exception("Hero upload to object storage failed during seed")
        qr = UPLOAD_DIR / "upi-qr-ritheesh.png"
        if qr.is_file():
            try:
                defaults["gpay_qr_url"] = put_local_file(qr, folder="misc", key_name="upi-qr-ritheesh.png")
            except Exception:
                pass
    await db.settings.update_one({"key": "site"}, {"$set": defaults}, upsert=True)

    if await db.gallery_items.count_documents({}) == 0:
        for i, fname in enumerate(GALLERY_FILENAMES):
            await db.gallery_items.insert_one({
                "id": new_id(), "image_url": _media_url(fname, folder="gallery"), "caption": "", "link_url": "",
                "sort_order": i, "created_at": now_iso(),
            })
    else:
        # Replace any stock gallery URLs with local product images
        gallery = await db.gallery_items.find({}, {"_id": 0}).sort("sort_order", 1).to_list(60)
        for i, g in enumerate(gallery):
            url = g.get("image_url") or ""
            if "unsplash" in url or "pexels" in url or "emergent" in url:
                fname = GALLERY_FILENAMES[i % len(GALLERY_FILENAMES)]
                await db.gallery_items.update_one({"id": g["id"]}, {"$set": {"image_url": _media_url(fname, folder="gallery")}})


async def _ensure_admin_account():
    """Ensure ADMIN_EMAIL has admin role. Password from ADMIN_PASSWORD env (required in production)."""
    admin_email = ADMIN_EMAIL
    existing = await db.users.find_one({"email": admin_email})
    if existing:
        patch = {"role": "admin", "email_verified": True, "is_blocked": False}
        if ADMIN_PASSWORD:
            patch["password_hash"] = hash_pw(ADMIN_PASSWORD)
            patch["token_version"] = int(existing.get("token_version", 0)) + 1
        await db.users.update_one({"email": admin_email}, {"$set": patch})
        # Demote any other accidental admins
        await db.users.update_many(
            {"role": "admin", "email": {"$ne": admin_email}},
            {"$set": {"role": "customer"}},
        )
        log.info("Ensured admin privileges for %s", admin_email)
        return

    if APP_ENV == "production" and not ADMIN_PASSWORD:
        log.error("ADMIN_PASSWORD not set — creating admin with temporary password is blocked in production")
        raise RuntimeError("Set ADMIN_PASSWORD for the primary admin account in production")

    password = ADMIN_PASSWORD or ("" if APP_ENV == "production" else "admin123")
    if not password:
        raise RuntimeError("ADMIN_PASSWORD required")
    if not ADMIN_PASSWORD and APP_ENV != "production":
        log.warning("Created admin %s with default password — set ADMIN_PASSWORD immediately", admin_email)

    await db.users.insert_one({
        "id": new_id(), "email": admin_email,
        "password_hash": hash_pw(password),
        "name": "Paper & Loop Admin", "phone": "",
        "role": "admin", "is_blocked": False,
        "address_line1": "", "address_line2": "",
        "city": "", "state": "", "pincode": "",
        "email_verified": True,
        "token_version": 0,
        "created_at": now_iso(),
    })
    log.info("Seeded admin: %s", admin_email)


async def _release_expired_reservations():
    """Cancel unpaid orders past reservation_expires_at and restore stock."""
    now = datetime.now(timezone.utc)
    expired = await db.orders.find({
        "status": {"$in": ["placed", "payment_under_validation"]},
        "payment_status": {"$in": ["pending", "under_validation", "rejected"]},
        "reservation_expires_at": {"$lte": now.isoformat()},
    }).to_list(200)
    for order in expired:
        await db.orders.update_one({"id": order["id"]}, {
            "$set": {"status": "cancelled", "updated_at": now_iso(), "cancelled_at": now_iso()},
            "$push": {"timeline": {
                "status": "cancelled",
                "at": now_iso(),
                "note": "Reservation expired — payment not verified in time",
            }},
        })
        for it in order.get("items", []):
            await db.products.update_one(
                {"id": it["product_id"]},
                {"$inc": {"stock_quantity": it["quantity"]}},
            )
    if expired:
        log.info("Released %d expired unpaid reservations", len(expired))


async def seed_if_empty():
    await _ensure_admin_account()
    await _get_settings()

    # Do not seed demo users, demo testimonials, or demo orders.
    if await db.products.count_documents({}) == 0:
        await _seed_products_and_assets()
    else:
        # Upgrade existing DBs that still have placeholder URLs
        sample = await db.products.find_one({}, {"_id": 0, "images": 1})
        if sample and sample.get("images") and any(
            "unsplash" in u or "pexels" in u for u in sample["images"]
        ):
            await _seed_products_and_assets()
        else:
            s = await db.settings.find_one({"key": "site"})
            if s and (
                "unsplash" in (s.get("hero_background_url") or "")
                or "emergent" in (s.get("hero_background_url") or "")
                or any("unsplash" in u for u in (s.get("hero_images") or []))
            ):
                try:
                    copy_all_assets()
                except FileNotFoundError:
                    pass
                await db.settings.update_one({"key": "site"}, {"$set": default_settings()}, upsert=True)

    await _ensure_brand_assets()
    await _migrate_upload_urls()
    # Backfill product status for older catalog rows
    await db.products.update_many(
        {"$or": [{"status": {"$exists": False}}, {"status": None}, {"status": ""}]},
        {"$set": {"status": "ACTIVE"}},
    )


async def _migrate_upload_urls():
    """Rewrite legacy /api/uploads/ paths to /uploads/ in MongoDB."""
    from migrate_upload_urls import migrate
    stats = await migrate(db)
    if any(stats.values()):
        log.info("Migrated upload URLs: %s", stats)


async def _ensure_brand_assets():
    """Sync hero + tees from Images/Hero/bg into object storage (or local uploads) and settings."""
    from object_storage import is_persistent_url, put_local_file, storage_configured

    hero_src = ROOT_DIR.parent / "Images" / "Hero" / "bg" / "hero-background.png"
    tees_src = ROOT_DIR.parent / "Images" / "Hero" / "bg" / "coming-soon-tees.png"
    if not hero_src.exists():
        return

    hero_url = None
    try:
        if storage_configured():
            hero_url = put_local_file(hero_src, folder="hero", key_name="hero-background.png")
            if tees_src.exists():
                put_local_file(tees_src, folder="misc", key_name="coming-soon-tees.png")
        else:
            copy_asset("Hero/bg/hero-background.png", "hero-background.png")
            if tees_src.exists():
                copy_asset("Hero/bg/coming-soon-tees.png", "coming-soon-tees.png")
            hero_url = upload_url("hero-background.png") + "?v=20260803"
    except FileNotFoundError:
        return
    except Exception:
        log.exception("Failed to sync brand assets to storage")
        return

    s = await db.settings.find_one({"key": "site"}) or {}
    patch: dict = {}
    defaults = default_settings()
    current_hero = s.get("hero_background_url") or ""

    # Never overwrite a permanent CDN URL with a relative /uploads path
    if is_persistent_url(current_hero) and not storage_configured():
        pass
    elif hero_url and current_hero != hero_url:
        # Replace local /uploads hero or mismatched URL with canonical storage URL
        if (
            not is_persistent_url(current_hero)
            or storage_configured()
            or re.search(r"unsplash|pexels|emergent", current_hero, re.I)
        ):
            patch["hero_background_url"] = hero_url
            if storage_configured():
                patch["hero_images"] = [hero_url]
            else:
                patch["hero_images"] = defaults["hero_images"]

    logo = s.get("logo_url") or ""
    if logo and re.search(r"emergent|unsplash|pexels", logo, re.I):
        patch["logo_url"] = ""
    ann = s.get("announcement") or ""
    if "Tokyo Nights" in ann or not ann:
        patch["announcement"] = defaults["announcement"]
    if patch:
        await db.settings.update_one({"key": "site"}, {"$set": patch}, upsert=True)
        log.info("Updated brand assets: %s", list(patch.keys()))


@app.on_event("startup")
async def on_startup():
    global _mongo_ready
    from object_storage import require_storage_in_production, storage_configured
    require_storage_in_production()
    log.info("Object storage configured=%s", storage_configured())
    _mongo_ready = await _verify_mongodb_connection()
    if not _mongo_ready:
        log.error("MongoDB unavailable at startup — serving health checks; DB routes will fail until connected.")
        return
    await ensure_indexes(db)
    await _refresh_categories_cache()
    await seed_if_empty()
    await _release_expired_reservations()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


@api.get("/")
async def root():
    return {
        "name": "Paper & Loop API",
        "status": "alive",
        "env": APP_ENV,
        "email_configured": email_configured(),
    }


app.include_router(api)
# Static uploads — local/dev only. Production media is served from Supabase public URLs.
if APP_ENV != "production":
    app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
    app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads_legacy")
else:
    log.info("Production: skipping StaticFiles mounts for /uploads (use Supabase Storage)")

# CORS — explicit origins + Vercel preview regex (never allow_origins="*" with credentials)
_DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://paperloop.shop",
    "https://www.paperloop.shop",
]
# Matches any Vercel deployment/preview URL (safe with allow_credentials — echoes exact Origin)
_CORS_VERCEL_REGEX = os.environ.get(
    "CORS_ORIGIN_REGEX",
    r"https://.*\.vercel\.app",
)


def _build_cors_origins() -> list[str]:
    extra = [
        o.strip()
        for o in os.environ.get("CORS_ORIGINS", "").split(",")
        if o.strip() and o.strip() != "*"
    ]
    return list(dict.fromkeys(_DEFAULT_CORS_ORIGINS + extra))


_cors_origins = _build_cors_origins()
if APP_ENV == "production" and not _cors_origins:
    log.error("CORS_ORIGINS must be an explicit allow-list in production")
log.info(
    "CORS allow_origins=%s allow_origin_regex=%s",
    _cors_origins,
    _CORS_VERCEL_REGEX,
)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins,
    allow_origin_regex=_CORS_VERCEL_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
)
