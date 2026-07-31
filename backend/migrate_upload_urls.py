"""One-shot: migrate /api/uploads/ → /uploads/ in MongoDB."""
from __future__ import annotations

import asyncio
import os

from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

OLD = "/api/uploads/"
NEW = "/uploads/"


def fix_url(value: str | None) -> str | None:
    if isinstance(value, str) and value.startswith(OLD):
        return NEW + value[len(OLD) :]
    return value


async def migrate(db) -> dict:
    stats = {"products": 0, "gallery": 0, "categories": 0, "settings": 0}

    async for p in db.products.find({}, {"_id": 0}):
        patch: dict = {}
        images = p.get("images") or []
        fixed = [fix_url(u) for u in images]
        if fixed != images:
            patch["images"] = fixed
        lifestyle = fix_url(p.get("lifestyle_image"))
        if lifestyle and lifestyle != p.get("lifestyle_image"):
            patch["lifestyle_image"] = lifestyle
        if patch:
            await db.products.update_one({"id": p["id"]}, {"$set": patch})
            stats["products"] += 1

    async for g in db.gallery_items.find({}, {"_id": 0}):
        fixed = fix_url(g.get("image_url"))
        if fixed and fixed != g.get("image_url"):
            await db.gallery_items.update_one({"id": g["id"]}, {"$set": {"image_url": fixed}})
            stats["gallery"] += 1

    async for c in db.categories.find({}, {"_id": 0}):
        fixed = fix_url(c.get("banner_image_url"))
        if fixed and fixed != c.get("banner_image_url"):
            await db.categories.update_one({"id": c["id"]}, {"$set": {"banner_image_url": fixed}})
            stats["categories"] += 1

    s = await db.settings.find_one({"key": "site"}) or {}
    patch: dict = {}
    hero = fix_url(s.get("hero_background_url"))
    if hero and hero != s.get("hero_background_url"):
        patch["hero_background_url"] = hero
    hero_images = s.get("hero_images") or []
    fixed_hero = [fix_url(u) for u in hero_images]
    if fixed_hero != hero_images:
        patch["hero_images"] = fixed_hero
    logo = fix_url(s.get("logo_url"))
    if logo and logo != s.get("logo_url"):
        patch["logo_url"] = logo
    if patch:
        await db.settings.update_one({"key": "site"}, {"$set": patch}, upsert=True)
        stats["settings"] = 1

    return stats


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    stats = await migrate(db)
    sample = await db.products.find_one({}, {"_id": 0, "name": 1, "images": 1})
    print("migration:", stats)
    print("sample:", sample)
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
