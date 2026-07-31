import { BACKEND_URL } from "@/lib/api";

const UUID_UPLOAD = /^[0-9a-f-]{36}\.[a-z0-9]+$/i;

/** Resolve a media URL for display — catalog assets ship in /uploads/ on Vercel. */
export const resolveMedia = (url) => {
  if (!url) return "";
  if (/^(https?:)?\/\//.test(url)) return url;

  if (url.startsWith("/api/uploads/")) {
    const filename = url.slice("/api/uploads/".length);
    if (BACKEND_URL && UUID_UPLOAD.test(filename)) {
      return `${BACKEND_URL}${url}`;
    }
    return `/uploads/${filename}`;
  }

  if (url.startsWith("/uploads/")) return url;

  if (url.startsWith("/api/") && BACKEND_URL) return `${BACKEND_URL}${url}`;

  return url;
};
