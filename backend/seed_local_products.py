"""Reseed MongoDB products from repo Images/ folder (local assets only)."""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from mongo_client import create_motor_client
    CATEGORIES,
    GALLERY_FILENAMES,
    PRODUCTS,
    copy_all_assets,
    default_settings,
    upload_url,
)

ROOT = __import__("pathlib").Path(__file__).parent
load_dotenv(ROOT / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def slugify(text: str) -> str:
    import re
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.strip().lower()).strip("-")
    return s or "product"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def main():
    copy_all_assets()
    client = create_motor_client()
    db = client[DB_NAME]

    for i, (name, slug, banner_file) in enumerate(CATEGORIES):
        banner = upload_url(banner_file)
        await db.categories.update_one(
            {"slug": slug},
            {"$set": {"name": name, "banner_image_url": banner, "sort_order": i},
             "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now_iso()}},
            upsert=True,
        )

    await db.products.delete_many({})
    for p in PRODUCTS:
        url = upload_url(p["filename"])
        doc = {
            "id": str(uuid.uuid4()),
            "slug": slugify(p["name"]),
            "name": p["name"],
            "description": p["description"],
            "category_slug": p["category_slug"],
            "price": p["price"],
            "discount_percent": p.get("discount_percent", 0),
            "stock_quantity": 25,
            "images": [url],
            "lifestyle_image": url,
            "material": p.get("material", "Premium 250gsm matte paper"),
            "size": p.get("size", "A3 (11.7 x 16.5 in)"),
            "finish": p.get("finish", "Matte, museum-grade ink"),
            "is_featured": p.get("is_featured", False),
            "is_trending": p.get("is_trending", False),
            "is_best_seller": p.get("is_best_seller", False),
            "is_new": p.get("is_new", False),
            "is_limited": p.get("is_limited", False),
            "visibility": "published",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.products.insert_one(doc)
        print(f"  + {p['name']} -> {url}")

    await db.settings.update_one({"key": "site"}, {"$set": default_settings()}, upsert=True)

    await db.gallery_items.delete_many({})
    for i, fname in enumerate(GALLERY_FILENAMES):
        await db.gallery_items.insert_one({
            "id": str(uuid.uuid4()),
            "image_url": upload_url(fname),
            "caption": "",
            "link_url": "",
            "sort_order": i,
            "created_at": now_iso(),
        })

    count = await db.products.count_documents({})
    print(f"\nSeeded {count} products")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
