/**
 * Generates frontend/public/products.json — static catalog for Vercel when API is unreachable.
 * Image paths use /uploads/ (bundled in public/uploads/).
 */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "public", "products.json");

const slugify = (text) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "product";

const img = (filename) => `/uploads/${filename}`;

const PRODUCTS = [
  {
    filename: "spider-man-iron-spider.jpg",
    name: "Spider-Man Iron Spider",
    category_slug: "movies",
    price: 799,
    discount_percent: 15,
    description: "Iron Spider suit hanging upside-down. Editorial poster with Indonesian motivational quote.",
    is_featured: true,
    is_best_seller: true,
    is_new: true,
  },
  {
    filename: "new-york-never-sleeps.jpg",
    name: "New York Never Sleeps",
    category_slug: "cities",
    price: 749,
    description: "Pink-toned Empire State skyline with cherry blossoms. The city that never sleeps.",
    is_featured: true,
    is_trending: true,
  },
  {
    filename: "tanjiro-kamado.jpg",
    name: "Tanjiro Kamado",
    category_slug: "anime",
    price: 699,
    description: "Demon Slayer archive print. Gentle but strong — vintage distressed aesthetic.",
    is_trending: true,
    is_new: true,
  },
  {
    filename: "ferrari-sf-25.jpg",
    name: "Ferrari SF-25",
    category_slug: "cars",
    price: 899,
    discount_percent: 10,
    description: "2025 Formula One challenger. Leclerc & Hamilton. Pole position energy on paper.",
    is_featured: true,
    is_best_seller: true,
  },
  {
    filename: "vogue-leopard.jpg",
    name: "Vogue Leopard",
    category_slug: "fashion",
    price: 849,
    description: "High-fashion leopard roar on dusty rose. Editorial magazine-cover energy.",
    is_trending: true,
  },
  {
    filename: "sabrina-carpenter-short-n-sweet.jpg",
    name: "Short n' Sweet",
    category_slug: "music",
    price: 749,
    description: "Sabrina Carpenter album art poster. Vintage blue portrait with full tracklist.",
    is_new: true,
    is_trending: true,
  },
  {
    filename: "play-music-louder.jpg",
    name: "Play Music Louder",
    category_slug: "music",
    price: 699,
    description: "Retro stippled headphones poster. Whatever happens, play music louder.",
    is_trending: true,
  },
  {
    filename: "virat-kohli-gods-plan.jpg",
    name: "God's Plan",
    category_slug: "sports",
    price: 799,
    description: "Virat Kohli RCB portrait. God's plan — cricket culture on matte paper.",
    is_best_seller: true,
  },
  {
    filename: "spider-man-peter-parker.jpg",
    name: "Spider-Man Peter Parker",
    category_slug: "movies",
    price: 749,
    description: "MCU upgraded suit over NYC skyline. With great power comes great responsibility.",
    is_featured: true,
  },
  {
    filename: "cristiano-ronaldo-legend.jpg",
    name: "CR7 Legend",
    category_slug: "sports",
    price: 849,
    description: "Cristiano Ronaldo Real Madrid collage. Discipline. Ambition. Obsession. Legend.",
    is_trending: true,
    is_limited: true,
  },
  {
    filename: "sweet-bear-unicorn-keychain.jpeg",
    name: "Sweet Bear Unicorn Keychain",
    category_slug: "keychains",
    price: 349,
    discount_percent: 10,
    description: "Kawaii bear-on-unicorn charm with purple SWEET wrist strap. Pocket flex.",
    material: "Acrylic + silicone strap + gold hardware",
    size: "45mm charm · adjustable strap",
    finish: "Enamel gloss",
    is_featured: true,
    is_best_seller: true,
    is_limited: true,
  },
];

const now = new Date().toISOString();

const catalog = PRODUCTS.map((p, i) => {
  const url = img(p.filename);
  const slug = slugify(p.name);
  return {
    id: `catalog-${slug}`,
    slug,
    name: p.name,
    description: p.description,
    category_slug: p.category_slug,
    price: p.price,
    discount_percent: p.discount_percent || 0,
    stock_quantity: 25,
    images: [url],
    lifestyle_image: url,
    material: p.material || "Premium 250gsm matte paper",
    size: p.size || "A3 (11.7 x 16.5 in)",
    finish: p.finish || "Matte, museum-grade ink",
    is_featured: Boolean(p.is_featured),
    is_trending: Boolean(p.is_trending),
    is_best_seller: Boolean(p.is_best_seller),
    is_new: Boolean(p.is_new),
    is_limited: Boolean(p.is_limited),
    visibility: "published",
    created_at: now,
    updated_at: now,
    sort_order: i,
  };
});

fs.writeFileSync(OUT, JSON.stringify(catalog, null, 2));
console.log(`[generate-products-json] wrote ${catalog.length} products → public/products.json`);
