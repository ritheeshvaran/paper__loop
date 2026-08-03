/** Resolve a media URL for display.

 * - Absolute https/http (Supabase Storage, CDN, pasted links) → as-is
 * - Legacy /uploads/ dynamic paths → API host in production / CRA proxy in dev
 * - Named catalog files → same-origin for Vercel public/uploads + CRA proxy
 * - Empty / falsy → placeholder (never crash layouts)
 */
import { BACKEND_URL } from "@/lib/api";

/** Safe fallback when a product has no image URL */
export const PLACEHOLDER_MEDIA = "/uploads/hero-background.png";

const UUID_FILE = /^[0-9a-f-]{36}(_\d+)?\.[a-z0-9]+$/i;
const HASH_FILE = /^[0-9a-f]{16,}(_\d+)?\.[a-z0-9]+$/i;

function isDynamicUpload(filename) {
  const base = filename.split("/").pop() || filename;
  return (
    UUID_FILE.test(filename) ||
    UUID_FILE.test(base) ||
    HASH_FILE.test(base) ||
    filename.startsWith("payments/") ||
    filename.startsWith("products/") ||
    filename.startsWith("gallery/") ||
    filename.startsWith("hero/") ||
    filename.startsWith("categories/") ||
    filename.startsWith("testimonials/") ||
    filename.startsWith("misc/") ||
    filename.startsWith("catalog/")
  );
}

export const resolveMedia = (url) => {
  if (!url) return PLACEHOLDER_MEDIA;
  const raw = String(url).trim();
  if (!raw) return PLACEHOLDER_MEDIA;

  // Absolute / protocol-relative — Supabase public URLs, CDN, external paste
  if (/^(https?:)?\/\//i.test(raw)) return raw;

  let path = raw;
  if (path.startsWith("/api/uploads/")) {
    path = "/uploads/" + path.slice("/api/uploads/".length);
  }

  if (path.startsWith("/uploads/")) {
    const [pathPart, query = ""] = path.split("?");
    const filename = pathPart.slice("/uploads/".length);
    const q = query ? `?${query}` : "";

    if (isDynamicUpload(filename)) {
      if (BACKEND_URL) return `${BACKEND_URL}/uploads/${filename}${q}`;
      return `${pathPart}${q}`;
    }

    return `${pathPart}${q}`;
  }

  if (path.startsWith("/api/") && BACKEND_URL) return `${BACKEND_URL}${path}`;

  return path;
};

/** img onError — swap to placeholder once (never loop). */
export const onMediaError = (e) => {
  if (e?.currentTarget?.dataset?.ph) return;
  if (e?.currentTarget) {
    e.currentTarget.dataset.ph = "1";
    e.currentTarget.src = PLACEHOLDER_MEDIA;
  }
};

/** Primary + hover lifestyle URLs with sane fallbacks. */
export const productDisplayImages = (product) => {
  const primary = product?.images?.[0];
  const lifestyle = product?.lifestyle_image || product?.images?.[1] || primary;
  return {
    primary: resolveMedia(primary),
    lifestyle: resolveMedia(lifestyle),
  };
};
