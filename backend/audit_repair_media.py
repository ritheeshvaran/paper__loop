"""Audit and repair ALL media URLs in MongoDB (products, gallery, testimonials, settings, categories).

Verifies each URL with local file check or HTTP HEAD/GET.
Repairs broken refs using product fallback chain or catalog defaults.

Run:  python audit_repair_media.py
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from media_validation import (
    DEFAULT_CATALOG,
    clear_media_url_cache,
    media_url_exists,
    pick_product_image_fallback,
    sanitize_product_media,
    seed_catalog_url,
)
from mongo_client import create_motor_client
from seed_data import upload_url

DB_NAME = os.environ["DB_NAME"]
REPORT_PATH = Path(__file__).parent / "media_audit_report.json"


async def _categories_map(db) -> Dict[str, dict]:
    cats = await db.categories.find({}, {"_id": 0}).to_list(100)
    return {c["slug"]: c for c in cats if c.get("slug")}


async def audit_and_repair(db) -> dict:
    clear_media_url_cache()
    categories = await _categories_map(db)
    report: dict = {
        "broken_found": [],
        "repaired": [],
        "still_broken": [],
        "products": 0,
        "gallery": 0,
        "testimonials": 0,
        "categories": 0,
        "settings": 0,
        "orders": 0,
    }

    async for p in db.products.find({}, {"_id": 0}):
        pid = p.get("id")
        name = p.get("name")
        patch: dict = {}
        sanitized = sanitize_product_media(p, categories, verify_remote=True)
        if sanitized.get("images") != p.get("images"):
            patch["images"] = sanitized["images"]
        if sanitized.get("lifestyle_image") != p.get("lifestyle_image"):
            patch["lifestyle_image"] = sanitized["lifestyle_image"]

        for field in ("images", "lifestyle_image"):
            before = p.get("images") if field == "images" else p.get("lifestyle_image")
            after = patch.get(field) if field in patch else before
            if field == "images":
                for i, (b, a) in enumerate(zip(before or [], after or [])):
                    if b != a:
                        report["broken_found"].append({"collection": "products", "id": pid, "name": name, "field": f"images[{i}]", "url": b})
                        report["repaired"].append({"collection": "products", "id": pid, "field": f"images[{i}]", "from": b, "to": a})
            elif before and before != after:
                report["broken_found"].append({"collection": "products", "id": pid, "name": name, "field": "lifestyle_image", "url": before})
                report["repaired"].append({"collection": "products", "id": pid, "field": "lifestyle_image", "from": before, "to": after})

        if patch:
            await db.products.update_one({"id": pid}, {"$set": patch})
            report["products"] += 1

    async for g in db.gallery_items.find({}, {"_id": 0}):
        u = g.get("image_url")
        if u and not media_url_exists(u):
            rep = upload_url("tanjiro-kamado.jpg")
            await db.gallery_items.update_one({"id": g["id"]}, {"$set": {"image_url": rep}})
            report["gallery"] += 1
            report["broken_found"].append({"collection": "gallery_items", "id": g["id"], "url": u})
            report["repaired"].append({"collection": "gallery_items", "id": g["id"], "from": u, "to": rep})

    async for t in db.testimonials.find({}, {"_id": 0}):
        u = t.get("photo_url")
        if u and not media_url_exists(u):
            await db.testimonials.update_one({"id": t["id"]}, {"$set": {"photo_url": ""}})
            report["testimonials"] += 1
            report["broken_found"].append({"collection": "testimonials", "id": t["id"], "url": u})
            report["repaired"].append({"collection": "testimonials", "id": t["id"], "from": u, "to": ""})

    async for c in db.categories.find({}, {"_id": 0}):
        u = c.get("banner_image_url")
        if u and not media_url_exists(u):
            rep = seed_catalog_url({"category_slug": c.get("slug")})
            await db.categories.update_one({"id": c["id"]}, {"$set": {"banner_image_url": rep}})
            report["categories"] += 1
            report["broken_found"].append({"collection": "categories", "id": c["id"], "slug": c.get("slug"), "url": u})
            report["repaired"].append({"collection": "categories", "id": c["id"], "from": u, "to": rep})

    s = await db.settings.find_one({"key": "site"}) or {}
    spatch: dict = {}
    for field in ("hero_background_url", "logo_url", "gpay_qr_url"):
        u = s.get(field)
        if u and not media_url_exists(u):
            rep = upload_url("hero-background.png") if "hero" in field else DEFAULT_CATALOG
            spatch[field] = rep
            report["settings"] += 1
            report["broken_found"].append({"collection": "settings", "field": field, "url": u})
            report["repaired"].append({"collection": "settings", "field": field, "from": u, "to": rep})
    heroes = list(s.get("hero_images") or [])
    new_heroes = []
    h_changed = False
    for u in heroes:
        if u and not media_url_exists(u):
            rep = upload_url("hero-background.png")
            new_heroes.append(rep)
            h_changed = True
            report["broken_found"].append({"collection": "settings", "field": "hero_images", "url": u})
            report["repaired"].append({"collection": "settings", "field": "hero_images", "from": u, "to": rep})
        else:
            new_heroes.append(u)
    if h_changed:
        spatch["hero_images"] = new_heroes
    if spatch:
        await db.settings.update_one({"key": "site"}, {"$set": spatch}, upsert=True)

    async for o in db.orders.find({}, {"_id": 0}):
        opatch: dict = {}
        ps = o.get("payment_screenshot_url")
        if ps and not media_url_exists(ps):
            opatch["payment_screenshot_url"] = None
            report["orders"] += 1
            report["broken_found"].append({"collection": "orders", "id": o["id"], "field": "payment_screenshot_url", "url": ps})
        items = list(o.get("items") or [])
        new_items = []
        items_changed = False
        for it in items:
            it = dict(it)
            pi = it.get("product_image")
            if pi and not media_url_exists(pi):
                rep = DEFAULT_CATALOG
                it["product_image"] = rep
                items_changed = True
                report["broken_found"].append({"collection": "orders", "id": o["id"], "field": "product_image", "url": pi})
                report["repaired"].append({"collection": "orders", "id": o["id"], "from": pi, "to": rep})
            new_items.append(it)
        if items_changed:
            opatch["items"] = new_items
        if opatch:
            await db.orders.update_one({"id": o["id"]}, {"$set": opatch})

    # Final verification pass
    clear_media_url_cache()
    async for p in db.products.find({}, {"_id": 0}):
        for u in (p.get("images") or []) + ([p.get("lifestyle_image")] if p.get("lifestyle_image") else []):
            if u and not media_url_exists(u):
                report["still_broken"].append({"collection": "products", "id": p.get("id"), "name": p.get("name"), "url": u})

    return report


async def main():
    client = create_motor_client()
    db = client[DB_NAME]
    print("Auditing all media URLs…")
    report = await audit_and_repair(db)
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("Report:", REPORT_PATH)
    print(f"broken_found: {len(report['broken_found'])}")
    print(f"repaired: {len(report['repaired'])}")
    print(f"still_broken: {len(report['still_broken'])}")
    for item in report["repaired"][:20]:
        print(" ", item)
    if report["still_broken"]:
        print("STILL BROKEN:", report["still_broken"])
        raise SystemExit(1)
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
