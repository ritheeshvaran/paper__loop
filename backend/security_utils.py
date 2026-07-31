"""Security helpers: OTP crypto, rate limits, upload validation, indexes."""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from pymongo import ReturnDocument

log = logging.getLogger("paperloop.security")

APP_ENV = os.environ.get("APP_ENV", "development")

OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_SEND_LIMIT = 5
OTP_SEND_WINDOW_MIN = 60  # 5 OTPs per hour per email
OTP_SEND_COOLDOWN_SEC = 60  # 1 OTP every 60 seconds
LOGIN_MAX_ATTEMPTS = 8
LOGIN_WINDOW_MIN = 15

ALLOWED_IMAGE_MIME = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}


def gen_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(code: str, secret: str) -> str:
    return hmac.new(secret.encode(), code.strip().encode(), hashlib.sha256).hexdigest()


def verify_otp_hash(code: str, digest: str, secret: str) -> bool:
    expected = hash_otp(code, secret)
    return hmac.compare_digest(expected, digest)


def detect_image(content: bytes) -> Optional[str]:
    """Return normalized extension if content is a real image, else None."""
    if not content or len(content) < 12:
        return None
    if content.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if content.startswith(b"GIF87a") or content.startswith(b"GIF89a"):
        return "gif"
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return "webp"
    return None


async def ensure_indexes(db) -> None:
    """Create production indexes (idempotent)."""
    specs = [
        ("users", [("email", 1)], {"unique": True}),
        ("users", [("role", 1)], {}),
        ("products", [("slug", 1)], {"unique": True}),
        ("products", [("visibility", 1), ("category_slug", 1)], {}),
        ("products", [("created_at", 1)], {}),
        ("orders", [("order_number", 1)], {"unique": True}),
        ("orders", [("user_id", 1), ("created_at", -1)], {}),
        ("orders", [("status", 1)], {}),
        ("carts", [("user_id", 1), ("product_id", 1)], {"unique": True}),
        ("wishlists", [("user_id", 1), ("product_id", 1)], {"unique": True}),
        ("otp_verifications", [("email", 1), ("purpose", 1), ("created_at", -1)], {}),
        ("otp_verifications", [("expires_at", 1)], {"expireAfterSeconds": 0}),
        ("otp_tokens", [("jti", 1)], {"unique": True}),
        ("otp_tokens", [("expires_at", 1)], {"expireAfterSeconds": 0}),
        ("rate_limits", [("key", 1)], {"unique": True}),
        ("rate_limits", [("expires_at", 1)], {"expireAfterSeconds": 0}),
        ("activity_log", [("created_at", -1)], {}),
        ("categories", [("slug", 1)], {"unique": True}),
    ]
    for coll_name, keys, opts in specs:
        try:
            await db[coll_name].create_index(keys, **opts)
        except Exception as e:
            log.warning("Index %s.%s skipped/failed: %s", coll_name, keys, e)
    log.info("MongoDB indexes ensured")


async def check_otp_cooldown(db, email: str, purpose: str) -> tuple[bool, int]:
    """Return (allowed, retry_after_seconds). Blocks if last OTP was sent < OTP_SEND_COOLDOWN_SEC ago."""
    if APP_ENV != "production":
        return True, 0
    doc = await db.otp_verifications.find_one(
        {"email": email, "purpose": purpose},
        sort=[("created_at", -1)],
        projection={"created_at": 1},
    )
    if not doc or not doc.get("created_at"):
        return True, 0
    created = doc["created_at"]
    if isinstance(created, str):
        created = datetime.fromisoformat(created.replace("Z", "+00:00"))
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - created).total_seconds()
    if elapsed >= OTP_SEND_COOLDOWN_SEC:
        return True, 0
    return False, max(1, int(OTP_SEND_COOLDOWN_SEC - elapsed))


async def check_rate_limit(db, key: str, limit: int, window_minutes: int) -> bool:
    """Return True if under limit, False if blocked."""
    if APP_ENV != "production":
        return True
    now = datetime.now(timezone.utc)
    bucket = int(now.timestamp() // (window_minutes * 60))
    doc_key = f"{key}:{bucket}"
    expires = now + timedelta(minutes=window_minutes + 5)
    result = await db.rate_limits.find_one_and_update(
        {"key": doc_key},
        {
            "$inc": {"count": 1},
            "$setOnInsert": {"expires_at": expires},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return (result or {}).get("count", 1) <= limit
