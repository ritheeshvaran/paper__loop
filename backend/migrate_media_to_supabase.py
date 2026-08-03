"""Migrate local backend/uploads media + MongoDB /uploads/ refs → Supabase Storage.

Usage (from backend/, with SUPABASE_* env set):
  python migrate_media_to_supabase.py

Idempotent:
  - Stable object keys from relative path (upsert) so re-runs skip duplicates
  - MongoDB URLs already on Supabase/HTTPS are left unchanged
  - Verifies each upload with a public HEAD/GET before rewriting Mongo
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Dict, Optional
from urllib.parse import unquote
from urllib.request import Request, urlopen

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from mongo_client import create_motor_client
from object_storage import (
    is_persistent_url,
    is_supabase_url,
    normalize_folder,
    public_url_for_key,
    put_bytes,
    storage_configured,
)

log = logging.getLogger("paperloop.migrate_supabase")
logging.basicConfig(level=logging.INFO)

ROOT = Path(__file__).parent
UPLOADS = ROOT / "uploads"
IMAGES = ROOT.parent / "Images"
PUBLIC_UPLOADS = ROOT.parent / "frontend" / "public" / "uploads"
DB_NAME = os.environ["DB_NAME"]
REPORT_PATH = ROOT / "migration_supabase_report.json"

# Local relative path → public Supabase URL (built once, reused for Mongo rewrites)
_PATH_URLS: Dict[str, str] = {}


def _guess_folder(rel_path: str) -> str:
    rel = rel_path.replace("\\", "/").lstrip("/")
    parts = rel.split("/")
    if parts and parts[0] in (
        "payments",
        "products",
        "gallery",
        "hero",
        "categories",
        "testimonials",
        "misc",
    ):
        return parts[0]
    name = Path(rel).name.lower()
    if "hero-background" in name or name.startswith("hero"):
        return "hero"
    if name.startswith("cat-") or "banner" in name:
        return "categories"
    if (
        "coming-soon" in name
        or name.startswith("auth-")
        or name.startswith("room-")
        or name.startswith("upi-")
        or name.startswith("logo")
    ):
        return "misc"
    return "products"


def _stable_key(rel_path: str) -> str:
    """Preserve folder structure under canonical prefixes; avoid double-prefixing."""
    rel = rel_path.replace("\\", "/").lstrip("/")
    folder = _guess_folder(rel)
    folder = normalize_folder(folder)
    # If already under a known folder prefix, keep as-is
    if rel.startswith(folder + "/"):
        return rel
    return f"{folder}/{Path(rel).name}"


def _verify_public(url: str) -> bool:
    try:
        req = Request(url, method="HEAD")
        with urlopen(req, timeout=30) as resp:
            return 200 <= getattr(resp, "status", 200) < 400
    except Exception:
        try:
            req = Request(url, method="GET")
            with urlopen(req, timeout=30) as resp:
                return 200 <= getattr(resp, "status", 200) < 400
        except Exception as e:
            log.warning("Verify failed for %s: %s", url, e)
            return False


def _upload_file(path: Path, rel: str) -> str:
    """Upload one local file with a stable key; return public URL."""
    if rel in _PATH_URLS:
        return _PATH_URLS[rel]
    key = _stable_key(rel)
    data = path.read_bytes()
    ext = path.suffix.lstrip(".").lower() or "bin"
    if ext == "jpeg":
        ext = "jpg"
    mime = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "gif": "image/gif",
    }.get(ext, "application/octet-stream")
    url = put_bytes(data, key, content_type=mime)
    _PATH_URLS[rel] = url
    # Also index by basename for Mongo /uploads/name.jpg lookups
    _PATH_URLS[Path(rel).name] = url
    if not _verify_public(url):
        log.warning("Upload stored but public verify failed (check bucket is PUBLIC): %s", url)
    return url


def _local_path_for_url(url: str) -> Optional[Path]:
    if not url or not isinstance(url, str):
        return None
    u = url.strip().split("?")[0]
    if u.startswith("/api/uploads/"):
        u = "/uploads/" + u[len("/api/uploads/") :]
    if not u.startswith("/uploads/"):
        return None
    rel = unquote(u[len("/uploads/") :])
    if ".." in rel:
        return None
    candidate = UPLOADS / rel
    if candidate.is_file():
        return candidate
    name = Path(rel).name
    for folder in (
        UPLOADS,
        UPLOADS / "payments",
        UPLOADS / "products",
        PUBLIC_UPLOADS,
        IMAGES / "Hero" / "bg",
        IMAGES / "Hero",
        IMAGES / "Poster",
        IMAGES / "Keychain",
    ):
        if not folder.exists():
            continue
        hit = folder / name
        if hit.is_file():
            return hit
    return None


def migrate_url(url: str) -> Optional[str]:
    """Return new Supabase URL, or None if unchanged / missing."""
    if not url or not isinstance(url, str):
        return None
    if is_supabase_url(url):
        return None
    if is_persistent_url(url) and not url.startswith("/uploads"):
        return None
    u = url.strip().split("?")[0]
    if u.startswith("/api/uploads/"):
        u = "/uploads/" + u[len("/api/uploads/") :]
    if not u.startswith("/uploads/"):
        return None
    rel = unquote(u[len("/uploads/") :])
    if rel in _PATH_URLS:
        return _PATH_URLS[rel]
    if Path(rel).name in _PATH_URLS:
        return _PATH_URLS[Path(rel).name]
    path = _local_path_for_url(url)
    if not path:
        log.warning("Missing local file for %s", url)
        return None
    try:
        try:
            rel_key = path.relative_to(UPLOADS).as_posix()
        except ValueError:
            rel_key = path.name
        return _upload_file(path, rel_key)
    except Exception:
        log.exception("Failed migrating %s", url)
        raise


async def migrate(db) -> dict:
    if not storage_configured():
        raise SystemExit(
            "Supabase not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, "
            "SUPABASE_STORAGE_BUCKET before migrating."
        )

    report = {
        "products": 0,
        "gallery": 0,
        "categories": 0,
        "settings": 0,
        "orders": 0,
        "testimonials": 0,
        "urls_rewritten": 0,
        "missing_files": 0,
        "uploaded_files": [],
        "failed": [],
        "skipped_already_remote": 0,
        "verified_ok": 0,
        "verified_failed": 0,
    }

    # Phase A — upload every local file once (stable keys + upsert)
    if UPLOADS.exists():
        for path in sorted(UPLOADS.rglob("*")):
            if not path.is_file() or path.name.startswith("."):
                continue
            try:
                rel = path.relative_to(UPLOADS).as_posix()
                url = _upload_file(path, rel)
                ok = _verify_public(url)
                report["uploaded_files"].append(
                    {
                        "file": rel,
                        "url": url,
                        "folder": _guess_folder(rel),
                        "verified": ok,
                    }
                )
                if ok:
                    report["verified_ok"] += 1
                else:
                    report["verified_failed"] += 1
            except Exception as e:
                report["failed"].append({"file": str(path), "error": str(e)})
                report["verified_failed"] += 1
                log.exception("Failed uploading %s", path)

    async def rewrite_list(urls: list) -> tuple[list, bool]:
        out = []
        changed = False
        for u in urls:
            if not u:
                continue
            if is_supabase_url(u) or (
                isinstance(u, str) and u.startswith("https://") and "/uploads/" not in u
            ):
                out.append(u)
                report["skipped_already_remote"] += 1
                continue
            try:
                nu = migrate_url(u)
            except Exception as e:
                report["failed"].append({"url": u, "error": str(e)})
                out.append(u)
                continue
            if nu:
                out.append(nu)
                changed = True
                report["urls_rewritten"] += 1
            else:
                if u and not is_persistent_url(u) and _local_path_for_url(u) is None:
                    report["missing_files"] += 1
                out.append(u)
        return out, changed

    async for p in db.products.find({}, {"_id": 0}):
        images, changed = await rewrite_list(list(p.get("images") or []))
        patch: dict = {}
        if changed:
            patch["images"] = images
        life = p.get("lifestyle_image")
        if life:
            try:
                nu = migrate_url(life)
            except Exception as e:
                report["failed"].append({"url": life, "error": str(e)})
                nu = None
            if nu:
                patch["lifestyle_image"] = nu
                report["urls_rewritten"] += 1
        if patch:
            await db.products.update_one({"id": p["id"]}, {"$set": patch})
            report["products"] += 1

    async for g in db.gallery_items.find({}, {"_id": 0}):
        try:
            nu = migrate_url(g.get("image_url"))
        except Exception as e:
            report["failed"].append({"url": g.get("image_url"), "error": str(e)})
            nu = None
        if nu:
            await db.gallery_items.update_one({"id": g["id"]}, {"$set": {"image_url": nu}})
            report["gallery"] += 1
            report["urls_rewritten"] += 1

    async for c in db.categories.find({}, {"_id": 0}):
        try:
            nu = migrate_url(c.get("banner_image_url"))
        except Exception as e:
            report["failed"].append({"url": c.get("banner_image_url"), "error": str(e)})
            nu = None
        if nu:
            await db.categories.update_one(
                {"id": c["id"]}, {"$set": {"banner_image_url": nu}}
            )
            report["categories"] += 1
            report["urls_rewritten"] += 1

    s = await db.settings.find_one({"key": "site"}) or {}
    patch: dict = {}
    for field in ("hero_background_url", "logo_url", "gpay_qr_url"):
        try:
            nu = migrate_url(s.get(field))
        except Exception as e:
            report["failed"].append({"url": s.get(field), "error": str(e)})
            nu = None
        if nu:
            patch[field] = nu
            report["urls_rewritten"] += 1
    heroes, h_changed = await rewrite_list(list(s.get("hero_images") or []))
    if h_changed:
        patch["hero_images"] = heroes
    if patch:
        await db.settings.update_one({"key": "site"}, {"$set": patch}, upsert=True)
        report["settings"] = 1

    async for t in db.testimonials.find({}, {"_id": 0}):
        try:
            nu = migrate_url(t.get("photo_url"))
        except Exception as e:
            report["failed"].append({"url": t.get("photo_url"), "error": str(e)})
            nu = None
        if nu:
            await db.testimonials.update_one({"id": t["id"]}, {"$set": {"photo_url": nu}})
            report["testimonials"] += 1
            report["urls_rewritten"] += 1

    async for o in db.orders.find({}, {"_id": 0}):
        opatch: dict = {}
        try:
            nu = migrate_url(o.get("payment_screenshot_url"))
        except Exception as e:
            report["failed"].append({"url": o.get("payment_screenshot_url"), "error": str(e)})
            nu = None
        if nu:
            opatch["payment_screenshot_url"] = nu
            report["urls_rewritten"] += 1
        items = list(o.get("items") or [])
        items_changed = False
        new_items = []
        for it in items:
            it = dict(it)
            try:
                pi = migrate_url(it.get("product_image"))
            except Exception as e:
                report["failed"].append({"url": it.get("product_image"), "error": str(e)})
                pi = None
            if pi:
                it["product_image"] = pi
                items_changed = True
                report["urls_rewritten"] += 1
            new_items.append(it)
        if items_changed:
            opatch["items"] = new_items
        if opatch:
            await db.orders.update_one({"id": o["id"]}, {"$set": opatch})
            report["orders"] += 1

    # Sanity: sample public URL format
    report["sample_public_url"] = next(
        (x["url"] for x in report["uploaded_files"] if x.get("url")), None
    )
    report["expected_public_prefix"] = (
        public_url_for_key("products/example.jpg").rsplit("/", 1)[0]
        if storage_configured()
        else None
    )
    return report


async def main():
    client = create_motor_client()
    db = client[DB_NAME]
    report = await migrate(db)
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("migration report written to", REPORT_PATH)
    print(json.dumps({k: v for k, v in report.items() if k != "uploaded_files"}, indent=2))
    print("uploaded_files count:", len(report.get("uploaded_files") or []))
    sample = await db.products.find_one({}, {"_id": 0, "name": 1, "images": 1})
    print("sample product:", sample)
    settings = await db.settings.find_one({"key": "site"}, {"_id": 0, "hero_background_url": 1})
    print("hero:", settings)
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
