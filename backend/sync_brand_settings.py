"""One-shot: sync hero + branding to MongoDB settings."""
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from seed_data import copy_asset, default_settings

load_dotenv(Path(__file__).parent / ".env")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


async def main():
    copy_asset("Hero/hero-background.png", "hero-background.png")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    patch = default_settings()
    await db.settings.update_one({"key": "site"}, {"$set": patch}, upsert=True)
    s = await db.settings.find_one({"key": "site"}, {"_id": 0})
    print("hero:", s.get("hero_background_url"))
    print("logo:", repr(s.get("logo_url")))
    print("announcement:", s.get("announcement"))
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
