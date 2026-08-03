"""Verify media URLs exist (local disk or remote HTTP) and pick fallbacks."""
from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import unquote

import requests

from seed_data import CATEGORIES, PRODUCTS, upload_url

log = logging.getLogger("paperloop.media")

ROOT = Path(__file__).parent
UPLOADS = ROOT / "uploads"
PUBLIC = ROOT.parent / "frontend" / "public" / "uploads"

DEFAULT_CATALOG = upload_url("tanjiro-kamado.jpg")
PLACEHOLDER = upload_url("hero-background.png")

CAT_BANNER: Dict[str, str] = {slug: upload_url(fname) for _, slug, fname in CATEGORIES}
SEED_BY_SLUG: Dict[str, str] = {}
SEED_BY_NAME: Dict[str, str] = {}

_url_cache: Dict[str, bool] = {}


def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s or "item"


for _p in PRODUCTS:
    SEED_BY_SLUG[_slugify(_p["name"])] = upload_url(_p["filename"])
    SEED_BY_NAME[_p["name"].strip().lower()] = upload_url(_p["filename"])


def normalize_media_url(url: str) -> str:
    if not url or not isinstance(url, str):
        return ""
    u = url.strip().split("?", 1)[0]
    if u.startswith("/api/uploads/"):
        u = "/uploads/" + u[len("/api/uploads/") :]
    return u


def local_path_for_url(url: str) -> Optional[Path]:
    u = normalize_media_url(url)
    if not u.startswith("/uploads/"):
        return None
    rel = unquote(u[len("/uploads/") :])
    if ".." in rel:
        return None
    candidate = UPLOADS / rel
    if candidate.is_file():
        return candidate
    name = Path(rel).name
    pub = PUBLIC / name
    if pub.is_file():
        return pub
    for sub in ("products", "payments", "gallery", "hero", "categories", "misc"):
        hit = UPLOADS / sub / name
        if hit.is_file():
            return hit
    return None


def local_file_exists(url: str) -> bool:
    return local_path_for_url(url) is not None


def remote_url_exists(url: str, *, timeout: float = 10.0) -> bool:
    if not url or not isinstance(url, str):
        return False
    u = url.strip().split("?", 1)[0]
    if not u.startswith("http://") and not u.startswith("https://"):
        return False
    try:
        resp = requests.head(u, timeout=timeout, allow_redirects=True)
        if resp.status_code in (405, 501):
            resp = requests.get(
                u,
                timeout=timeout,
                stream=True,
                headers={"Range": "bytes=0-0"},
            )
        return 200 <= resp.status_code < 400
    except requests.RequestException as exc:
        log.debug("Remote media check failed for %s: %s", u, exc)
        return False


def media_url_exists(url: str, *, use_cache: bool = True) -> bool:
    """Return True if the media URL resolves to an existing object."""
    if not url or not isinstance(url, str):
        return False
    key = normalize_media_url(url)
    if use_cache and key in _url_cache:
        return _url_cache[key]
    u = url.strip()
    ok = False
    if u.startswith("/uploads/") or u.startswith("/api/uploads/"):
        ok = local_file_exists(u)
    elif u.startswith("http://") or u.startswith("https://"):
        ok = remote_url_exists(u)
    if use_cache and key:
        _url_cache[key] = ok
    return ok


def clear_media_url_cache() -> None:
    _url_cache.clear()


def seed_catalog_url(product: dict) -> str:
    slug = (product.get("slug") or "").strip().lower()
    name = (product.get("name") or "").strip().lower()
    if slug in SEED_BY_SLUG:
        return SEED_BY_SLUG[slug]
    if name in SEED_BY_NAME:
        return SEED_BY_NAME[name]
    for n, url in SEED_BY_NAME.items():
        if n in name or name in n:
            return url
    cat = product.get("category_slug") or "anime"
    return CAT_BANNER.get(cat) or DEFAULT_CATALOG


def category_banner_url(category_slug: str, categories: Optional[Dict[str, dict]] = None) -> str:
    if categories and category_slug in categories:
        b = categories[category_slug].get("banner_image_url")
        if b:
            return b
    return CAT_BANNER.get(category_slug or "anime") or DEFAULT_CATALOG


def pick_product_image_fallback(
    product: dict,
    broken: str,
    *,
    categories: Optional[Dict[str, dict]] = None,
    verify: bool = True,
) -> str:
    """Secondary image → lifestyle → category banner → seed catalog."""
    exclude = normalize_media_url(broken)

    def ok(u: Optional[str]) -> bool:
        if not u or normalize_media_url(u) == exclude:
            return False
        return media_url_exists(u) if verify else (
            u.startswith("http") or local_file_exists(u)
        )

    images: List[str] = list(product.get("images") or [])
    # Prefer other gallery images first
    for u in images[1:] + images[:1]:
        if ok(u):
            return u

    life = product.get("lifestyle_image")
    if ok(life):
        return life

    cat = product.get("category_slug") or "anime"
    banner = category_banner_url(cat, categories)
    if ok(banner):
        return banner

    seed = seed_catalog_url(product)
    if ok(seed):
        return seed

    if images and images[0] and normalize_media_url(images[0]) != exclude:
        return images[0]

    return DEFAULT_CATALOG


def sanitize_product_media(
    product: dict,
    categories: Optional[Dict[str, dict]] = None,
    *,
    verify_remote: bool = False,
) -> dict:
    """Ensure product image fields never reference missing local files."""
    p = dict(product)
    verify = verify_remote

    def ok(u: Optional[str]) -> bool:
        if not u:
            return False
        if not verify and u.startswith("http"):
            return True
        return media_url_exists(u, use_cache=True)

    images = list(p.get("images") or [])
    new_images: List[str] = []
    changed = False
    for u in images:
        if ok(u):
            new_images.append(u)
        else:
            rep = pick_product_image_fallback(p, u, categories=categories, verify=verify)
            new_images.append(rep)
            changed = True

    if not new_images:
        new_images = [pick_product_image_fallback(p, "", categories=categories, verify=verify)]
        changed = True

    if changed or new_images != images:
        p["images"] = new_images

    life = p.get("lifestyle_image")
    if life and not ok(life):
        p["lifestyle_image"] = pick_product_image_fallback(
            {**p, "images": new_images}, life, categories=categories, verify=verify
        )
    elif not life and new_images:
        p["lifestyle_image"] = new_images[0]

    return p


def validate_media_url_or_raise(url: str, *, field: str = "image") -> str:
    """Raise ValueError if URL is empty or does not exist."""
    if not url or not str(url).strip():
        raise ValueError(f"{field} URL is required")
    u = str(url).strip()
    if not media_url_exists(u, use_cache=False):
        raise ValueError(f"{field} URL does not exist or is not reachable: {u}")
    return u


def validate_media_urls_or_raise(urls: List[str], *, field: str = "image") -> List[str]:
    out: List[str] = []
    for i, u in enumerate(urls or []):
        if not u or not str(u).strip():
            continue
        out.append(validate_media_url_or_raise(u, field=f"{field}[{i}]"))
    return out
