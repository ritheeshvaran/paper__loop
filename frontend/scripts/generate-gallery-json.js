/**
 * Generates frontend/public/gallery.json for static gallery on Vercel.
 */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "public", "gallery.json");

const GALLERY_FILENAMES = [
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
];

const gallery = GALLERY_FILENAMES.map((fname, i) => ({
  id: `gallery-${i}`,
  image_url: `/uploads/${fname}`,
  caption: "",
  link_url: "",
  sort_order: i,
}));

fs.writeFileSync(OUT, JSON.stringify(gallery, null, 2));
console.log(`[generate-gallery-json] wrote ${gallery.length} items → public/gallery.json`);
