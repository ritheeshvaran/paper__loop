"""Repair product/gallery image URLs that point at missing local /uploads/ files.

Admin-uploaded UUID files are often lost when Render redeploys (ephemeral disk).
This script:
  1. Detects /uploads/… refs whose files are missing on disk
  2. Restores seed catalog filenames when product name/slug matches PRODUCTS
  3. Otherwise falls back to the category banner so the shop is never blank
  4. Leaves https:// CDN/R2 URLs untouched

Run:  python repair_broken_media.py
"""
from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from mongo_client import create_motor_client
from seed_data import CATEGORIES, PRODUCTS, upload_url

UPLOADS = Path(__file__).parent / "uploads"
PUBLIC = Path(__file__).parent.parent / "frontend" / "public" / "uploads"
DB_NAME = os.environ["DB_NAME"]

CAT_BANNER = {slug: upload_url(fname) for _, slug, fname in CATEGORIES}
SEED_BY_SLUG = {}
SEED_BY_NAME = {}


def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s or "item"


for p in PRODUCTS:
    SEED_BY_SLUG[_slugify(p["name"])] = upload_url(p["filename"])
    SEED_BY_NAME[p["name"].strip().lower()] = upload_url(p["filename"])


def file_exists(url: str) -> bool:
    if not url or not isinstance(url, str):
        return False
    if url.startswith("http://") or url.startswith("https://"):
        return True  # external / CDN — assume OK
    u = url.split("?", 1)[0]
    if u.startswith("/api/uploads/"):
        u = "/uploads/" + u[len("/api/uploads/") :]
    if not u.startswith("/uploads/"):
        return False
    rel = u[len("/uploads/") :]
    if ".." in rel:
        return False
    return (UPLOADS / rel).is_file() or (PUBLIC / Path(rel).name).is_file()


def pick_replacement(product: dict, broken_url: str) -> str:
    slug = (product.get("slug") or "").strip().lower()
    name = (product.get("name") or "").strip().lower()
    if slug in SEED_BY_SLUG:
        return SEED_BY_SLUG[slug]
    if name in SEED_BY_NAME:
        return SEED_BY_NAME[name]
    # fuzzy: seed name contained in product name or vice versa
    for n, url in SEED_BY_NAME.items():
        if n in name or name in n:
            return url
    cat = product.get("category_slug") or "anime"
    return CAT_BANNER.get(cat) or upload_url("tanjiro-kamado.jpg")


async def repair(db) -> dict:
    stats = {"products_fixed": 0, "urls_rewritten": 0, "gallery_fixed": 0, "ok": 0}

    async for p in db.products.find({}, {"_id": 0}):
        patch: dict = {}
        images = list(p.get("images") or [])
        new_images = []
        changed = False
        for u in images:
            if file_exists(u):
                new_images.append(u)
                stats["ok"] += 1
            else:
                rep = pick_replacement(p, u)
                new_images.append(rep)
                changed = True
                stats["urls_rewritten"] += 1
                print(f"  product {p.get('name')!r}: {u} -> {rep}")
        if changed:
            patch["images"] = new_images
        life = p.get("lifestyle_image")
        if life and not file_exists(life):
            patch["lifestyle_image"] = (patch.get("images") or new_images or [None])[0]
            stats["urls_rewritten"] += 1
            changed = True
        if patch:
            await db.products.update_one({"id": p["id"]}, {"$set": patch})
            stats["products_fixed"] += 1

    async for g in db.gallery_items.find({}, {"_id": 0}):
        u = g.get("image_url")
        if u and not file_exists(u):
            # Prefer a known catalog poster
            rep = upload_url("tanjiro-kamado.jpg")
            await db.gallery_items.update_one({"id": g["id"]}, {"$set": {"image_url": rep}})
            stats["gallery_fixed"] += 1
            print(f"  gallery {g.get('id')}: {u} -> {rep}")

    return stats


async def main():
    client = create_motor_client()
    db = client[DB_NAME]
    print("Repairing broken media references…")
    stats = await repair(db)
    print("done:", stats)
    # verify
    broken = 0
    async for p in db.products.find({}, {"_id": 0, "name": 1, "images": 1}):
        for u in p.get("images") or []:
            if not file_exists(u):
                broken += 1
                print("STILL BROKEN", p["name"], u)
    print("remaining broken product images:", broken)
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
