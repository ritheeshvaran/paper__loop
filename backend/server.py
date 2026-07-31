"""Paper & Loop – Backend API (FastAPI + MongoDB)."""
from __future__ import annotations

import os
import re
import uuid
import random
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Literal

import bcrypt
import jwt
import resend
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
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


# ─── Setup ──────────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).parent
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "paper-loop-dev-secret-change-me")
JWT_ALG = "HS256"
JWT_TTL_HOURS = 24 * 14

APP_ENV = os.environ.get("APP_ENV", "development")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "Paper & Loop <onboarding@resend.dev>")
BRAND_NAME = "Paper & Loop"

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

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
def make_token(user_id: str, role: str) -> str:
    return jwt.encode({"sub": user_id, "role": role,
                       "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS),
                       "iat": datetime.now(timezone.utc)}, JWT_SECRET, algorithm=JWT_ALG)
def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
def strip_id(doc):
    if doc is None: return None
    doc.pop("_id", None); return doc


async def get_current_user(cred: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    if not cred: raise HTTPException(401, "Not authenticated")
    try: payload = decode_token(cred.credentials)
    except jwt.PyJWTError: raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or user.get("is_blocked"): raise HTTPException(401, "User not found or blocked")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin": raise HTTPException(403, "Admin only")
    return user


# ─── Email helper ───────────────────────────────────────────────────────────
async def send_email(to: str, subject: str, html: str) -> dict:
    """Send transactional email. Returns { status, id?, dev_content? }.
    Tries Resend if configured; else logs the payload."""
    if RESEND_API_KEY:
        try:
            params = {"from": SENDER_EMAIL, "to": [to], "subject": subject, "html": html}
            resp = await asyncio.to_thread(resend.Emails.send, params)
            log.info("Email sent via Resend: %s → %s", resp.get("id"), to)
            return {"status": "sent", "id": resp.get("id")}
        except Exception as e:
            log.exception("Resend failed: %s", e)
    log.warning("EMAIL[%s]: to=%s subject=%s", APP_ENV, to, subject)
    log.info("EMAIL HTML: %s", html[:400])
    return {"status": "logged"}


def _otp_html(code: str, purpose: str) -> str:
    verb = "verify your email" if purpose == "registration" else "reset your password"
    return f"""
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; background: #0A0A0A; padding: 40px 20px; color: #fff;">
      <div style="max-width: 480px; margin: 0 auto; background: #141414; padding: 32px; border: 1px solid #2A2A2A;">
        <div style="font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #FF6A00; margin-bottom: 12px;">Paper &amp; Loop</div>
        <h1 style="font-size: 24px; margin: 0 0 8px; letter-spacing: -0.02em;">Your code to {verb}</h1>
        <p style="color: #B8B8B4; margin: 0 0 24px;">Use the 6-digit code below. It expires in 10 minutes.</p>
        <div style="font-size: 42px; letter-spacing: 12px; font-weight: 700; padding: 16px 24px; background: #0A0A0A; border: 1px solid #FF6A00; display: inline-block; color: #FF6A00;">{code}</div>
        <p style="color: #8A8A85; font-size: 12px; margin-top: 32px;">Didn't request this? Ignore this email — your account stays untouched.</p>
      </div>
    </div>
    """


# ─── Models ─────────────────────────────────────────────────────────────────
class SendOtpInput(BaseModel):
    email: EmailStr
    purpose: Literal["registration", "password_reset"] = "registration"


class VerifyOtpInput(BaseModel):
    email: EmailStr
    code: str
    purpose: Literal["registration", "password_reset"] = "registration"


class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    phone: str = ""
    address_line1: str = ""
    address_line2: str = ""
    city: str = ""
    state: str = ""
    pincode: str = ""
    otp_token: Optional[str] = None  # returned by verify-otp


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
    new_password: str = Field(min_length=6)


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
    stock_quantity: int = 10
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


class CartItemInput(BaseModel):
    product_id: str
    quantity: int = 1


class CheckoutInput(BaseModel):
    order_note: str = ""
    address_line1: str
    address_line2: str = ""
    city: str
    state: str
    pincode: str
    phone: str


class SubmitPaymentInput(BaseModel):
    transaction_id: str


class UpdateOrderStatusInput(BaseModel):
    status: str
    note: Optional[str] = None


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


class RestockAlertInput(BaseModel):
    email: EmailStr
    product_id: str


class TestimonialInput(BaseModel):
    name: str
    quote: str
    location: Optional[str] = ""
    photo_url: Optional[str] = ""
    rating: int = 5


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


ORDER_FLOW = ["placed", "payment_under_validation", "approved",
              "preparing", "packed", "out_for_delivery", "delivered"]


# ─── OTP Endpoints ──────────────────────────────────────────────────────────
def _gen_otp() -> str:
    return f"{random.randint(0, 999999):06d}"


@api.post("/auth/send-otp")
async def send_otp(inp: SendOtpInput):
    email = inp.email.lower()
    if inp.purpose == "registration":
        existing = await db.users.find_one({"email": email})
        if existing:
            raise HTTPException(400, "Email already registered — sign in instead")
    else:
        if not await db.users.find_one({"email": email}):
            raise HTTPException(404, "No account with that email")
    # Rate-limit: max 5 per 10 minutes
    recent = await db.otp_verifications.count_documents({
        "email": email, "purpose": inp.purpose,
        "created_at": {"$gte": (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()},
    })
    if recent >= 5:
        raise HTTPException(429, "Too many attempts. Try again in a bit.")
    code = _gen_otp()
    doc = {
        "id": new_id(),
        "email": email,
        "purpose": inp.purpose,
        "code_hash": hash_pw(code),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        "verified_at": None,
        "consumed": False,
        "attempts": 0,
        "created_at": now_iso(),
    }
    await db.otp_verifications.insert_one(doc)
    email_res = await send_email(email,
        f"Your {BRAND_NAME} verification code: {code}",
        _otp_html(code, inp.purpose))
    resp: dict = {"sent": True, "expires_in": 600, "delivery": email_res["status"]}
    if APP_ENV == "development" and email_res["status"] != "sent":
        # Dev fallback so full-stack tests can proceed without external email
        resp["dev_code"] = code
    return resp


@api.post("/auth/verify-otp")
async def verify_otp(inp: VerifyOtpInput):
    email = inp.email.lower()
    doc = await db.otp_verifications.find_one({
        "email": email, "purpose": inp.purpose, "consumed": False,
    }, sort=[("created_at", -1)])
    if not doc:
        raise HTTPException(404, "No active OTP. Request a new code.")
    if doc.get("attempts", 0) >= 5:
        raise HTTPException(429, "Too many attempts. Request a new code.")
    if datetime.fromisoformat(doc["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(400, "Code expired. Request a new one.")
    ok = verify_pw(inp.code.strip(), doc["code_hash"])
    if not ok:
        await db.otp_verifications.update_one({"id": doc["id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "Incorrect code")
    # Mint a short-lived otp_token proving verification (10 min)
    token = jwt.encode({
        "email": email, "purpose": inp.purpose,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
    }, JWT_SECRET, algorithm=JWT_ALG)
    await db.otp_verifications.update_one(
        {"id": doc["id"]},
        {"$set": {"verified_at": now_iso(), "consumed": True}},
    )
    return {"verified": True, "otp_token": token}


def _verify_otp_token(token: str, email: str, purpose: str) -> None:
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise HTTPException(400, "OTP verification expired or invalid")
    if payload.get("email") != email.lower() or payload.get("purpose") != purpose:
        raise HTTPException(400, "OTP verification mismatch")


# ─── Auth Routes ────────────────────────────────────────────────────────────
@api.post("/auth/register")
async def register(inp: RegisterInput):
    email = inp.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    # Enforce OTP verification if an otp_token was provided or in prod
    if inp.otp_token:
        _verify_otp_token(inp.otp_token, email, "registration")
    user = {
        "id": new_id(), "email": email,
        "password_hash": hash_pw(inp.password),
        "name": inp.name, "phone": inp.phone,
        "address_line1": inp.address_line1, "address_line2": inp.address_line2,
        "city": inp.city, "state": inp.state, "pincode": inp.pincode,
        "role": "customer", "is_blocked": False,
        "email_verified": bool(inp.otp_token),
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    token = make_token(user["id"], user["role"])
    user.pop("password_hash", None); user.pop("_id", None)
    # Welcome email (fire-and-forget)
    asyncio.create_task(send_email(email, f"Welcome to {BRAND_NAME}",
        f"<div style='font-family:sans-serif;padding:20px'><h2>Welcome, {inp.name}.</h2>"
        f"<p>Your account is live. First drop alerts are on their way.</p></div>"))
    return {"token": token, "user": user}


@api.post("/auth/login")
async def login(inp: LoginInput):
    user = await db.users.find_one({"email": inp.email.lower()})
    if not user: raise HTTPException(404, "No account found with that email")
    if not verify_pw(inp.password, user["password_hash"]): raise HTTPException(401, "Password doesn't match")
    if user.get("is_blocked"): raise HTTPException(403, "Account blocked")
    token = make_token(user["id"], user["role"])
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
    _verify_otp_token(inp.otp_token, inp.email, "password_reset")
    result = await db.users.update_one(
        {"email": inp.email.lower()},
        {"$set": {"password_hash": hash_pw(inp.new_password)}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "No account with that email")
    return {"reset": True}


# ─── Categories ─────────────────────────────────────────────────────────────
@api.get("/categories")
async def list_categories():
    return await db.categories.find({}, {"_id": 0}).sort("sort_order", 1).to_list(200)


@api.post("/admin/categories")
async def create_category(inp: CategoryInput, _: dict = Depends(require_admin)):
    slug = inp.slug or slugify(inp.name)
    if await db.categories.find_one({"slug": slug}):
        raise HTTPException(400, "Slug already exists")
    doc = {"id": new_id(), "slug": slug, "name": inp.name,
           "banner_image_url": inp.banner_image_url, "sort_order": inp.sort_order,
           "created_at": now_iso()}
    await db.categories.insert_one(doc); doc.pop("_id", None); return doc


@api.put("/admin/categories/{cat_id}")
async def update_category(cat_id: str, inp: CategoryInput, _: dict = Depends(require_admin)):
    patch = inp.model_dump(exclude_unset=True)
    await db.categories.update_one({"id": cat_id}, {"$set": patch})
    return strip_id(await db.categories.find_one({"id": cat_id}))


@api.delete("/admin/categories/{cat_id}")
async def delete_category(cat_id: str, _: dict = Depends(require_admin)):
    cat = await db.categories.find_one({"id": cat_id})
    if not cat: raise HTTPException(404, "Category not found")
    cnt = await db.products.count_documents({"category_slug": cat["slug"]})
    if cnt > 0: raise HTTPException(400, "Reassign products before deleting")
    await db.categories.delete_one({"id": cat_id})
    return {"ok": True}


# ─── Products ───────────────────────────────────────────────────────────────
def _compute_price(p: dict) -> dict:
    disc = float(p.get("discount_percent") or 0)
    price = float(p["price"])
    final = round(price * (1 - disc / 100), 2) if disc else price
    p["final_price"] = final
    p["has_discount"] = disc > 0
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
    patch = inp.model_dump(exclude_unset=True)
    patch["updated_at"] = now_iso()
    await db.products.update_one({"id": pid}, {"$set": patch})
    # Restock trigger: if stock went from 0 → >0, fire restock alerts
    if existing.get("stock_quantity", 0) <= 0 and patch.get("stock_quantity", 0) > 0:
        asyncio.create_task(_fire_restock_alerts(pid))
    await _log(admin, "product_updated", "product", pid, existing.get("name"), patch.get("name", existing.get("name")))
    return _compute_price(strip_id(await db.products.find_one({"id": pid})))


@api.delete("/admin/products/{pid}")
async def delete_product(pid: str, admin: dict = Depends(require_admin)):
    p = await db.products.find_one({"id": pid})
    await db.products.delete_one({"id": pid})
    if p: await _log(admin, "product_deleted", "product", pid, p.get("name"), None)
    return {"ok": True}


# ─── Product image upload (base64 or file → served under /uploads) ──────────
@api.post("/admin/upload")
async def upload_file(file: UploadFile = File(...), _: dict = Depends(require_admin)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Only image uploads are allowed")
    ext = (file.filename or "img.jpg").rsplit(".", 1)[-1].lower()[:6]
    fname = f"{new_id()}.{ext}"
    dest = UPLOAD_DIR / fname
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 8MB)")
    with dest.open("wb") as f:
        f.write(content)
    return {"url": f"/uploads/{fname}"}


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
    existing = await db.carts.find_one({"user_id": user["id"], "product_id": inp.product_id})
    if existing:
        await db.carts.update_one({"_id": existing["_id"]},
                                  {"$inc": {"quantity": inp.quantity},
                                   "$set": {"updated_at": now_iso()}})
    else:
        await db.carts.insert_one({"id": new_id(), "user_id": user["id"],
                                   "product_id": inp.product_id, "quantity": inp.quantity,
                                   "updated_at": now_iso()})
    return await _fetch_cart(user["id"])


@api.put("/cart/{product_id}")
async def update_cart(product_id: str, inp: CartItemInput, user: dict = Depends(get_current_user)):
    if inp.quantity <= 0:
        await db.carts.delete_one({"user_id": user["id"], "product_id": product_id})
    else:
        await db.carts.update_one({"user_id": user["id"], "product_id": product_id},
                                  {"$set": {"quantity": inp.quantity, "updated_at": now_iso()}})
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
    order_id = new_id()
    order = {
        "id": order_id,
        "order_number": await _next_order_number(),
        "user_id": user["id"],
        "customer_name": user["name"],
        "customer_email": user["email"],
        "phone": inp.phone,
        "address_line1": inp.address_line1, "address_line2": inp.address_line2,
        "city": inp.city, "state": inp.state, "pincode": inp.pincode,
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
        "transaction_id": None, "delivery_date": None,
        "order_note": inp.order_note,
        "reservation_expires_at": (datetime.now(timezone.utc) + timedelta(minutes=45)).isoformat(),
        "timeline": [{"status": "placed", "at": now_iso(), "note": "Order placed"}],
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.orders.insert_one(order)
    for it in cart["items"]:
        await db.products.update_one({"id": it["product_id"]},
                                     {"$inc": {"stock_quantity": -it["quantity"]}})
    await db.carts.delete_many({"user_id": user["id"]})
    asyncio.create_task(send_email(user["email"],
        f"Order received — {order['order_number']}",
        f"<p>Hi {user['name']},<br/>Your order <b>{order['order_number']}</b> is placed. Complete the UPI payment to lock it in.</p>"))
    return strip_id(order)


@api.post("/orders/{order_id}/submit-payment")
async def submit_payment(order_id: str, inp: SubmitPaymentInput, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id, "user_id": user["id"]})
    if not order: raise HTTPException(404, "Order not found")
    if order["status"] not in ("placed", "payment_under_validation"):
        raise HTTPException(400, "Order not accepting payment update")
    await db.orders.update_one({"id": order_id}, {
        "$set": {"transaction_id": inp.transaction_id,
                 "status": "payment_under_validation",
                 "payment_status": "under_validation",
                 "updated_at": now_iso()},
        "$push": {"timeline": {"status": "payment_under_validation",
                                "at": now_iso(),
                                "note": f"Transaction {inp.transaction_id} submitted"}},
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
    if order["status"] not in ("placed", "payment_under_validation", "approved"):
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
    query: dict = {}
    if status: query["status"] = status
    if q:
        query["$or"] = [
            {"order_number": {"$regex": q, "$options": "i"}},
            {"customer_email": {"$regex": q, "$options": "i"}},
            {"customer_name": {"$regex": q, "$options": "i"}},
            {"transaction_id": {"$regex": q, "$options": "i"}},
        ]
    return await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)


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
    asyncio.create_task(send_email(order["customer_email"],
        f"Order update: {order['order_number']} is now {new_status.replace('_', ' ').title()}",
        f"<p>Your order <b>{order['order_number']}</b> moved to <b>{new_status.replace('_', ' ').title()}</b>.</p>"))
    return strip_id(await db.orders.find_one({"id": order_id}))


@api.put("/admin/orders/{order_id}/delivery-date")
async def admin_set_delivery(order_id: str, inp: SetDeliveryDateInput,
                             _: dict = Depends(require_admin)):
    await db.orders.update_one({"id": order_id},
                               {"$set": {"delivery_date": inp.delivery_date, "updated_at": now_iso()}})
    return strip_id(await db.orders.find_one({"id": order_id}))


# ─── Admin: Customers ───────────────────────────────────────────────────────
@api.get("/admin/customers")
async def admin_list_customers(_: dict = Depends(require_admin)):
    users = await db.users.find({"role": "customer"},
                                {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    for u in users:
        orders = await db.orders.find({"user_id": u["id"]}, {"_id": 0}).to_list(500)
        u["order_count"] = len(orders)
        u["total_spent"] = round(sum(o.get("total", 0) for o in orders if o.get("status") != "cancelled"), 2)
    return users


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
        await send_email(a["email"], f"Back in stock: {p['name']}",
            f"<p><b>{p['name']}</b> is restocked. Grab yours before it disappears again.</p>")
        await db.restock_alerts.update_one({"_id": a["_id"]}, {"$set": {"notified": True, "notified_at": now_iso()}})


@api.get("/testimonials")
async def list_testimonials():
    return await db.testimonials.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)


@api.post("/admin/testimonials")
async def create_testimonial(inp: TestimonialInput, _: dict = Depends(require_admin)):
    doc = inp.model_dump()
    doc.update({"id": new_id(), "created_at": now_iso()})
    await db.testimonials.insert_one(doc); doc.pop("_id", None); return doc


@api.delete("/admin/testimonials/{tid}")
async def delete_testimonial(tid: str, _: dict = Depends(require_admin)):
    await db.testimonials.delete_one({"id": tid}); return {"ok": True}


@api.get("/gallery")
async def list_gallery():
    return await db.gallery_items.find({}, {"_id": 0}).sort("sort_order", 1).to_list(60)


@api.post("/admin/gallery")
async def create_gallery(inp: GalleryItemInput, _: dict = Depends(require_admin)):
    doc = inp.model_dump()
    doc.update({"id": new_id(), "created_at": now_iso()})
    await db.gallery_items.insert_one(doc); doc.pop("_id", None); return doc


@api.delete("/admin/gallery/{gid}")
async def delete_gallery(gid: str, _: dict = Depends(require_admin)):
    await db.gallery_items.delete_one({"id": gid}); return {"ok": True}


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
    if patch:
        await db.settings.update_one({"key": "site"}, {"$set": patch}, upsert=True)
        await _log(admin, "settings_updated", "settings", "site", None, list(patch.keys()))
    return await _get_settings()


# ─── Admin: Analytics ───────────────────────────────────────────────────────
@api.get("/admin/analytics")
async def admin_analytics(_: dict = Depends(require_admin)):
    orders = await db.orders.find({}, {"_id": 0}).to_list(2000)
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

    for i, (name, slug, banner_file) in enumerate(CATEGORIES):
        banner = upload_url(banner_file)
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
        url = upload_url(p["filename"])
        doc = {
            "id": new_id(), "slug": slugify(p["name"]), "name": p["name"],
            "description": p["description"], "category_slug": p["category_slug"],
            "price": p["price"], "discount_percent": p.get("discount_percent", 0),
            "stock_quantity": p.get("stock_quantity", 25),
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

    # Refresh site settings with local brand assets
    defaults = default_settings()
    await db.settings.update_one({"key": "site"}, {"$set": defaults}, upsert=True)

    if await db.gallery_items.count_documents({}) == 0:
        for i, fname in enumerate(GALLERY_FILENAMES):
            await db.gallery_items.insert_one({
                "id": new_id(), "image_url": upload_url(fname), "caption": "", "link_url": "",
                "sort_order": i, "created_at": now_iso(),
            })
    else:
        # Replace any stock gallery URLs with local product images
        gallery = await db.gallery_items.find({}, {"_id": 0}).sort("sort_order", 1).to_list(60)
        for i, g in enumerate(gallery):
            url = g.get("image_url") or ""
            if "unsplash" in url or "pexels" in url or "emergent" in url:
                fname = GALLERY_FILENAMES[i % len(GALLERY_FILENAMES)]
                await db.gallery_items.update_one({"id": g["id"]}, {"$set": {"image_url": upload_url(fname)}})


async def seed_if_empty():
    admin_email = "ritheeshvaran2007@gmail.com"
    if not await db.users.find_one({"email": admin_email}):
        await db.users.insert_one({
            "id": new_id(), "email": admin_email,
            "password_hash": hash_pw("admin123"),
            "name": "Paper & Loop Admin", "phone": "",
            "role": "admin", "is_blocked": False,
            "address_line1": "", "address_line2": "",
            "city": "", "state": "", "pincode": "",
            "email_verified": True,
            "created_at": now_iso(),
        })
        log.info("Seeded admin: %s", admin_email)

    demo_email = "demo@paperandloop.com"
    if not await db.users.find_one({"email": demo_email}):
        await db.users.insert_one({
            "id": new_id(), "email": demo_email,
            "password_hash": hash_pw("demo1234"),
            "name": "Demo Customer", "phone": "9999999999",
            "role": "customer", "is_blocked": False,
            "address_line1": "12, MG Road", "address_line2": "Flat 3B",
            "city": "Chennai", "state": "Tamil Nadu", "pincode": "600001",
            "email_verified": True,
            "created_at": now_iso(),
        })

    await _get_settings()

    if await db.testimonials.count_documents({}) == 0:
        for t in TESTIMONIALS:
            await db.testimonials.insert_one({"id": new_id(), **t, "created_at": now_iso()})

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


async def _migrate_upload_urls():
    """Rewrite legacy /api/uploads/ paths to /uploads/ in MongoDB."""
    from migrate_upload_urls import migrate
    stats = await migrate(db)
    if any(stats.values()):
        log.info("Migrated upload URLs: %s", stats)


async def _ensure_brand_assets():
    """Sync hero image from Images/Hero and strip legacy Emergent branding from settings."""
    hero_src = ROOT_DIR.parent / "Images" / "Hero" / "hero-background.png"
    if not hero_src.exists():
        return
    try:
        copy_asset("Hero/hero-background.png", "hero-background.png")
    except FileNotFoundError:
        return
    s = await db.settings.find_one({"key": "site"}) or {}
    patch: dict = {}
    hero = upload_url("hero-background.png")
    if s.get("hero_background_url") != hero:
        patch["hero_background_url"] = hero
        patch["hero_images"] = default_settings()["hero_images"]
    logo = s.get("logo_url") or ""
    if logo and re.search(r"emergent|unsplash|pexels", logo, re.I):
        patch["logo_url"] = ""
    ann = s.get("announcement") or ""
    if "Tokyo Nights" in ann or not ann:
        patch["announcement"] = default_settings()["announcement"]
    if patch:
        await db.settings.update_one({"key": "site"}, {"$set": patch}, upsert=True)
        log.info("Updated brand assets: %s", list(patch.keys()))


@app.on_event("startup")
async def on_startup():
    await seed_if_empty()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


@api.get("/")
async def root():
    return {"name": "Paper & Loop API", "status": "alive", "env": APP_ENV}


app.include_router(api)
# Static uploads — /uploads/ is the canonical public path (Vercel + backend)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads_legacy")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
