"""Persistent media storage for Paper & Loop — Supabase Storage.

Production (required):
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_STORAGE_BUCKET

Local development without Supabase falls back to backend/uploads/ only.
Production NEVER writes to the Render filesystem.
"""
from __future__ import annotations

import logging
import mimetypes
import os
import time
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlparse

log = logging.getLogger("paperloop.storage")

APP_ENV = os.environ.get("APP_ENV", "development")
UPLOAD_DIR = Path(__file__).parent / "uploads"

# Canonical folder prefixes inside the bucket
FOLDERS = ("products", "gallery", "hero", "categories", "payments", "testimonials", "misc")

_EXT_MIME = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "gif": "image/gif",
}

_FOLDER_ALIASES = {
    "": "products",
    "products": "products",
    "payments": "payments",
    "gallery": "gallery",
    "hero": "hero",
    "categories": "categories",
    "testimonials": "testimonials",
    "misc": "misc",
    "catalog": "misc",
}


def _strip_slash(url: str) -> str:
    return (url or "").rstrip("/")


def _supabase_url() -> str:
    return _strip_slash(os.environ.get("SUPABASE_URL") or "")


def _supabase_key() -> str:
    return (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()


def _bucket() -> str:
    return (os.environ.get("SUPABASE_STORAGE_BUCKET") or "").strip()


def storage_configured() -> bool:
    return bool(_supabase_url() and _supabase_key() and _bucket())


def require_storage_in_production() -> None:
    if APP_ENV == "production" and not storage_configured():
        log.error(
            "PRODUCTION: Supabase Storage is NOT configured. "
            "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET."
        )


def normalize_folder(folder: str = "products") -> str:
    key = (folder or "products").strip("/").lower().replace("..", "")
    return _FOLDER_ALIASES.get(key, "misc" if key not in FOLDERS else key)


def unique_object_key(ext: str, *, folder: str = "products") -> str:
    """UUID + timestamp filename under the given folder."""
    folder = normalize_folder(folder)
    ext = (ext or "bin").lower().lstrip(".")
    if ext == "jpeg":
        ext = "jpg"
    name = f"{uuid.uuid4()}_{int(time.time())}.{ext}"
    return f"{folder}/{name}"


def public_url_for_key(key: str) -> str:
    """Full public HTTPS URL for an object in the public bucket."""
    base = _supabase_url()
    bucket = _bucket()
    key = key.lstrip("/")
    return f"{base}/storage/v1/object/public/{bucket}/{key}"


def is_persistent_url(url: str) -> bool:
    if not url or not isinstance(url, str):
        return False
    return url.startswith("https://") or url.startswith("http://")


def is_supabase_url(url: str) -> bool:
    if not is_persistent_url(url):
        return False
    base = _supabase_url()
    if base and url.startswith(base + "/storage/"):
        return True
    return "/storage/v1/object/public/" in url


def is_allowed_media_url(url: str) -> bool:
    """Payment / media URL validation — Supabase HTTPS, any HTTPS, or legacy /uploads/ in dev."""
    if not url or not isinstance(url, str):
        return False
    u = url.strip()
    if u.startswith("/uploads/"):
        # Legacy local paths (dev / pre-migration)
        return True
    if not is_persistent_url(u):
        return False
    if is_supabase_url(u):
        return True
    # Allow external pasted https URLs (admin paste)
    return u.startswith("https://")


def object_key_from_url(url: str) -> Optional[str]:
    """Extract storage object key from a Supabase public URL, if possible."""
    if not url or not isinstance(url, str):
        return None
    u = url.strip().split("?", 1)[0]
    marker = "/storage/v1/object/public/"
    if marker not in u:
        return None
    rest = u.split(marker, 1)[1]
    # rest = "{bucket}/{key...}"
    parts = rest.split("/", 1)
    if len(parts) < 2:
        return None
    bucket, key = parts[0], parts[1]
    if _bucket() and bucket != _bucket():
        # Still allow delete if bucket name differs only in env mismatch during migration
        pass
    return unquote(key)


def _client():
    from supabase import create_client

    return create_client(_supabase_url(), _supabase_key())


def put_bytes(content: bytes, key: str, *, content_type: Optional[str] = None) -> str:
    """Upload bytes to Supabase Storage (or local disk in development). Returns public URL."""
    if not content:
        raise ValueError("Empty file")
    key = key.lstrip("/")
    if ".." in key or key.startswith("/"):
        raise ValueError("Invalid storage key")

    ext = key.rsplit(".", 1)[-1].lower() if "." in key else ""
    ctype = content_type or _EXT_MIME.get(ext) or mimetypes.guess_type(key)[0] or "application/octet-stream"

    if storage_configured():
        client = _client()
        bucket = _bucket()
        try:
            client.storage.from_(bucket).upload(
                path=key,
                file=content,
                file_options={
                    "content-type": ctype,
                    "cache-control": "31536000",
                    "upsert": "true",
                },
            )
        except Exception as e:
            # supabase-py may raise on duplicate; retry with upsert already true
            msg = str(e).lower()
            if "already exists" in msg or "duplicate" in msg or "400" in msg:
                try:
                    client.storage.from_(bucket).update(
                        path=key,
                        file=content,
                        file_options={
                            "content-type": ctype,
                            "cache-control": "31536000",
                            "upsert": "true",
                        },
                    )
                except Exception:
                    log.exception("Supabase upload/update failed for %s", key)
                    raise
            else:
                log.exception("Supabase upload failed for %s", key)
                raise
        url = public_url_for_key(key)
        log.info("Uploaded to Supabase Storage: %s", url)
        return url

    if APP_ENV == "production":
        raise RuntimeError(
            "Supabase Storage is required in production. "
            "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET."
        )

    # Dev-only local fallback
    dest = UPLOAD_DIR / key
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)
    log.warning(
        "Stored image locally (dev only): /uploads/%s — configure Supabase for production",
        key,
    )
    return f"/uploads/{key}"


def put_local_file(path: Path, *, folder: str = "misc", key_name: Optional[str] = None) -> str:
    """Upload an existing local file; returns public URL."""
    data = path.read_bytes()
    ext = path.suffix.lstrip(".").lower() or "bin"
    if ext == "jpeg":
        ext = "jpg"
    folder = normalize_folder(folder)
    if key_name:
        # Stable catalog keys (hero-background.png) for idempotent seed/migration
        safe = Path(key_name).name.replace("..", "")
        key = f"{folder}/{safe}"
    else:
        key = unique_object_key(ext, folder=folder)
    return put_bytes(data, key, content_type=_EXT_MIME.get(ext))


def delete_object_by_url(url: str) -> bool:
    """Delete a Supabase object referenced by public URL. Returns True if deleted/attempted."""
    key = object_key_from_url(url)
    if not key:
        return False
    if not storage_configured():
        # Local legacy path
        if url.startswith("/uploads/"):
            local = UPLOAD_DIR / url[len("/uploads/") :]
            if local.is_file():
                try:
                    local.unlink()
                    return True
                except OSError:
                    return False
        return False
    try:
        client = _client()
        client.storage.from_(_bucket()).remove([key])
        log.info("Deleted Supabase object: %s", key)
        return True
    except Exception:
        log.exception("Failed to delete Supabase object: %s", key)
        return False


def delete_urls(urls) -> int:
    """Delete many media URLs; returns count of delete attempts that succeeded."""
    n = 0
    for u in urls or []:
        if u and delete_object_by_url(u):
            n += 1
    return n


# Back-compat aliases used by older call sites
def content_key(content: bytes, ext: str, *, prefix: str = "products") -> str:
    """Generate a unique key (UUID+timestamp). `content` unused — kept for signature compat."""
    return unique_object_key(ext, folder=prefix)
