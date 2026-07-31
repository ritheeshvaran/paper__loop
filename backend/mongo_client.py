"""MongoDB client factory — Atlas TLS compatibility for cloud hosts (Render, etc.)."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import certifi
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")


def normalize_mongo_url(url: str) -> str:
    """Ensure Atlas-friendly defaults without dropping existing query params."""
    parsed = urlparse(url)
    params = parse_qs(parsed.query, keep_blank_values=True)
    params.setdefault("retryWrites", ["true"])
    params.setdefault("w", ["majority"])
    query = urlencode({k: v[-1] for k, v in params.items()})
    return urlunparse(parsed._replace(query=query))


def mongo_client_kwargs(url: str) -> dict[str, Any]:
    """
    Build Motor/PyMongo kwargs for reliable Atlas TLS on Linux cloud runtimes.

    Render/Ubuntu images often lack a CA bundle Python can use for Atlas unless
    tlsCAFile is set explicitly (certifi). mongodb+srv:// enables TLS automatically.
    """
    kwargs: dict[str, Any] = {
        "serverSelectionTimeoutMS": int(os.environ.get("MONGO_SERVER_SELECTION_TIMEOUT_MS", "30000")),
        "connectTimeoutMS": int(os.environ.get("MONGO_CONNECT_TIMEOUT_MS", "20000")),
        "socketTimeoutMS": int(os.environ.get("MONGO_SOCKET_TIMEOUT_MS", "30000")),
    }
    lower = url.lower()
    if url.startswith("mongodb+srv://") or "tls=true" in lower or "ssl=true" in lower:
        kwargs["tlsCAFile"] = certifi.where()
    return kwargs


def create_motor_client(url: str | None = None) -> AsyncIOMotorClient:
    mongo_url = normalize_mongo_url(url or os.environ["MONGO_URL"])
    return AsyncIOMotorClient(mongo_url, **mongo_client_kwargs(mongo_url))
