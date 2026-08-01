"""Paper & Loop — canonical product catalog and brand asset definitions."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).parent
REPO = ROOT.parent
IMAGES = REPO / "Images"
UPLOADS = ROOT / "uploads"

CATEGORIES = [
    ("Anime", "anime", "tanjiro-kamado.jpg"),
    ("Cars", "cars", "ferrari-sf-25.jpg"),
    ("Sports", "sports", "virat-kohli-gods-plan.jpg"),
    ("Movies", "movies", "spider-man-peter-parker.jpg"),
    ("Music", "music", "play-music-louder.jpg"),
    ("Fashion", "fashion", "vogue-leopard.jpg"),
    ("Cities", "cities", "new-york-never-sleeps.jpg"),
    ("Gaming", "gaming", "cristiano-ronaldo-legend.jpg"),
    ("Motivational", "motivational", "spider-man-iron-spider.jpg"),
    ("Keychains", "keychains", "sweet-bear-unicorn-keychain.jpeg"),
]

PRODUCTS = [
    {
        "source": "Poster/1aa3b94b8e30471df649ad19b5b3ed65.jpg",
        "filename": "spider-man-iron-spider.jpg",
        "name": "Spider-Man Iron Spider",
        "category_slug": "movies",
        "price": 799,
        "discount_percent": 15,
        "description": "Iron Spider suit hanging upside-down. Editorial poster with Indonesian motivational quote.",
        "is_featured": True,
        "is_best_seller": True,
        "is_new": True,
    },
    {
        "source": "Poster/312fe99b8a4b3fe968719e225ba5bc5c.jpg",
        "filename": "new-york-never-sleeps.jpg",
        "name": "New York Never Sleeps",
        "category_slug": "cities",
        "price": 749,
        "description": "Pink-toned Empire State skyline with cherry blossoms. The city that never sleeps.",
        "is_featured": True,
        "is_trending": True,
    },
    {
        "source": "Poster/37bc11c534e513292dc1a94147c4735f.jpg",
        "filename": "tanjiro-kamado.jpg",
        "name": "Tanjiro Kamado",
        "category_slug": "anime",
        "price": 699,
        "description": "Demon Slayer archive print. Gentle but strong — vintage distressed aesthetic.",
        "is_trending": True,
        "is_new": True,
    },
    {
        "source": "Poster/44c1fcc262b26d1dc892e6737d5fcacf.jpg",
        "filename": "ferrari-sf-25.jpg",
        "name": "Ferrari SF-25",
        "category_slug": "cars",
        "price": 899,
        "discount_percent": 10,
        "description": "2025 Formula One challenger. Leclerc & Hamilton. Pole position energy on paper.",
        "is_featured": True,
        "is_best_seller": True,
    },
    {
        "source": "Poster/47d73b831cd965dc232d3f13debea190.jpg",
        "filename": "vogue-leopard.jpg",
        "name": "Vogue Leopard",
        "category_slug": "fashion",
        "price": 849,
        "description": "High-fashion leopard roar on dusty rose. Editorial magazine-cover energy.",
        "is_trending": True,
    },
    {
        "source": "Poster/52f1076fec30c399c0abc37784376d41.jpg",
        "filename": "sabrina-carpenter-short-n-sweet.jpg",
        "name": "Short n' Sweet",
        "category_slug": "music",
        "price": 749,
        "description": "Sabrina Carpenter album art poster. Vintage blue portrait with full tracklist.",
        "is_new": True,
        "is_trending": True,
    },
    {
        "source": "Poster/99da93c360f3ed5e61167308833b0979.jpg",
        "filename": "play-music-louder.jpg",
        "name": "Play Music Louder",
        "category_slug": "music",
        "price": 699,
        "description": "Retro stippled headphones poster. Whatever happens, play music louder.",
        "is_trending": True,
    },
    {
        "source": "Poster/a36a1b5094b38efed18404e61fc82f40.jpg",
        "filename": "virat-kohli-gods-plan.jpg",
        "name": "God's Plan",
        "category_slug": "sports",
        "price": 799,
        "description": "Virat Kohli RCB portrait. God's plan — cricket culture on matte paper.",
        "is_best_seller": True,
    },
    {
        "source": "Poster/c854ccce48c3dbbeb16a834046bce01c.jpg",
        "filename": "spider-man-peter-parker.jpg",
        "name": "Spider-Man Peter Parker",
        "category_slug": "movies",
        "price": 749,
        "description": "MCU upgraded suit over NYC skyline. With great power comes great responsibility.",
        "is_featured": True,
    },
    {
        "source": "Poster/f2fea7f0553a50921855e7a2dba73127.jpg",
        "filename": "cristiano-ronaldo-legend.jpg",
        "name": "CR7 Legend",
        "category_slug": "sports",
        "price": 849,
        "description": "Cristiano Ronaldo Real Madrid collage. Discipline. Ambition. Obsession. Legend.",
        "is_trending": True,
        "is_limited": True,
    },
    {
        "source": "Keychain/WhatsApp Image 2026-07-31 at 7.16.20 AM.jpeg",
        "filename": "sweet-bear-unicorn-keychain.jpeg",
        "name": "Sweet Bear Unicorn Keychain",
        "category_slug": "keychains",
        "price": 349,
        "discount_percent": 10,
        "description": "Kawaii bear-on-unicorn charm with purple SWEET wrist strap. Pocket flex.",
        "material": "Acrylic + silicone strap + gold hardware",
        "size": "45mm charm · adjustable strap",
        "finish": "Enamel gloss",
        "is_featured": True,
        "is_best_seller": True,
        "is_limited": True,
    },
]

# UI / marketing assets copied from Images/ into uploads/
BRAND_ASSETS = [
    {"source": "Hero/hero-background.png", "filename": "hero-background.png"},
    {"source": "Poster/44c1fcc262b26d1dc892e6737d5fcacf.jpg", "filename": "auth-login.jpg"},
    {"source": "Poster/37bc11c534e513292dc1a94147c4735f.jpg", "filename": "auth-register.jpg"},
    {"source": "Poster/99da93c360f3ed5e61167308833b0979.jpg", "filename": "auth-forgot.jpg"},
    {"source": "Poster/c854ccce48c3dbbeb16a834046bce01c.jpg", "filename": "auth-about.jpg"},
    {"source": "Poster/312fe99b8a4b3fe968719e225ba5bc5c.jpg", "filename": "room-bedroom.jpg"},
    {"source": "Poster/f2fea7f0553a50921855e7a2dba73127.jpg", "filename": "room-gaming.jpg"},
    {"source": "Poster/47d73b831cd965dc232d3f13debea190.jpg", "filename": "room-living.jpg"},
    {"source": "Poster/52f1076fec30c399c0abc37784376d41.jpg", "filename": "coming-soon-tees.jpg"},
    {"source": "Poster/37bc11c534e513292dc1a94147c4735f.jpg", "filename": "coming-soon-hoodies.jpg"},
    {"source": "Keychain/WhatsApp Image 2026-07-31 at 7.16.20 AM.jpeg", "filename": "coming-soon-accessories.jpeg"},
]

GALLERY_FILENAMES = [
    "spider-man-iron-spider.jpg",
    "ferrari-sf-25.jpg",
    "tanjiro-kamado.jpg",
    "virat-kohli-gods-plan.jpg",
    "cristiano-ronaldo-legend.jpg",
    "vogue-leopard.jpg",
    "play-music-louder.jpg",
    "sabrina-carpenter-short-n-sweet.jpg",
    "new-york-never-sleeps.jpg",
    "spider-man-peter-parker.jpg",
]

TESTIMONIALS = [
    {"name": "Aarav K.", "location": "Bengaluru", "rating": 5,
     "quote": "Ordered the Ferrari SF-25 poster. It's on my wall and every friend who walks in asks where I got it. Print quality is next level.",
     "photo_url": ""},
    {"name": "Priya S.", "location": "Mumbai", "rating": 5,
     "quote": "The Tanjiro poster is exactly what my room needed. Fast delivery, thick matte paper — not cheap glossy stuff.",
     "photo_url": ""},
    {"name": "Rohan D.", "location": "Delhi", "rating": 5,
     "quote": "Bought two posters and the Sweet Bear keychain. Packaging alone felt like unboxing a premium drop.",
     "photo_url": ""},
    {"name": "Ishani M.", "location": "Chennai", "rating": 5,
     "quote": "Their curation is unmatched. Every drop has a specific mood — you can tell they actually care.",
     "photo_url": ""},
]


def upload_url(filename: str) -> str:
    return f"/uploads/{filename}"


def copy_asset(source_rel: str, dest_name: str) -> None:
    src = IMAGES / source_rel
    if not src.exists():
        raise FileNotFoundError(f"Missing asset: {src}")
    UPLOADS.mkdir(exist_ok=True)
    shutil.copy2(src, UPLOADS / dest_name)


def copy_all_assets() -> None:
    seen: set[str] = set()
    for p in PRODUCTS:
        if p["filename"] not in seen:
            copy_asset(p["source"], p["filename"])
            seen.add(p["filename"])
    for a in BRAND_ASSETS:
        if a["filename"] not in seen:
            copy_asset(a["source"], a["filename"])
            seen.add(a["filename"])


def default_settings() -> dict:
    hero = upload_url("hero-background.png")
    return {
        "logo_url": "",
        "hero_background_url": hero,
        "hero_images": [
            hero,
            upload_url("spider-man-peter-parker.jpg"),
            upload_url("new-york-never-sleeps.jpg"),
        ],
        "gpay_qr_url": "/uploads/upi-qr-ritheesh.png",
        "upi_id": "ritheeshvaran2007@okhdfcbank",
        "announcement": "New Drop — Collector posters & keychains. Limited then gone.",
        "instagram_url": "https://instagram.com/paperandloop",
        "whatsapp_url": "https://wa.me/919999999999",
        "contact_email": "hello@paperandloop.com",
        "contact_phone": "+91 99999 99999",
        "address": "Chennai, India",
    }
