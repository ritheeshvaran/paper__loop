/**
 * Copies catalog images into frontend/public/uploads for Vercel static hosting.
 * Sources (first match wins): backend/uploads → Images/ → already in public/uploads.
 */
const fs = require("fs");
const path = require("path");

const FRONTEND = path.resolve(__dirname, "..");
const REPO = path.resolve(FRONTEND, "..");
const DEST = path.join(FRONTEND, "public", "uploads");

const CATALOG = [
  "hero-background.png",
  "coming-soon-tees.png",
  "auth-login.jpg",
  "auth-register.jpg",
  "auth-forgot.jpg",
  "auth-about.jpg",
  "room-bedroom.jpg",
  "room-gaming.jpg",
  "room-living.jpg",
  "coming-soon-hoodies.jpg",
  "coming-soon-accessories.jpeg",
  "spider-man-iron-spider.jpg",
  "new-york-never-sleeps.jpg",
  "tanjiro-kamado.jpg",
  "ferrari-sf-25.jpg",
  "vogue-leopard.jpg",
  "sabrina-carpenter-short-n-sweet.jpg",
  "play-music-louder.jpg",
  "virat-kohli-gods-plan.jpg",
  "spider-man-peter-parker.jpg",
  "cristiano-ronaldo-legend.jpg",
  "sweet-bear-unicorn-keychain.jpeg",
];

const SOURCES = [
  path.join(REPO, "backend", "uploads"),
  path.join(REPO, "Images", "Hero", "bg"),
  path.join(REPO, "Images", "Hero"),
  path.join(REPO, "Images", "Poster"),
  path.join(REPO, "Images", "Keychain"),
];

function findSource(name) {
  for (const dir of SOURCES) {
    const direct = path.join(dir, name);
    if (fs.existsSync(direct)) return direct;
  }
  if (name === "hero-background.png") {
    const hero = path.join(REPO, "Images", "Hero", "bg", "hero-background.png");
    if (fs.existsSync(hero)) return hero;
    const legacy = path.join(REPO, "Images", "Hero", "hero-background.png");
    if (fs.existsSync(legacy)) return legacy;
  }
  if (name === "coming-soon-tees.png") {
    const tees = path.join(REPO, "Images", "Hero", "bg", "coming-soon-tees.png");
    if (fs.existsSync(tees)) return tees;
  }
  if (name === "sweet-bear-unicorn-keychain.jpeg" || name === "coming-soon-accessories.jpeg") {
    for (const dir of [path.join(REPO, "Images", "Keychain")]) {
      if (!fs.existsSync(dir)) continue;
      const hit = fs.readdirSync(dir).find((f) => /\.jpe?g$/i.test(f));
      if (hit) return path.join(dir, hit);
    }
  }
  return null;
}

fs.mkdirSync(DEST, { recursive: true });

let copied = 0;
let missing = [];

for (const name of CATALOG) {
  const dest = path.join(DEST, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) continue;

  const src = findSource(name);
  if (!src) {
    if (!fs.existsSync(dest)) missing.push(name);
    continue;
  }
  fs.copyFileSync(src, dest);
  copied++;
  console.log(`  synced ${name}`);
}

if (missing.length) {
  console.error("[sync-public-uploads] missing required assets:", missing.join(", "));
  process.exit(1);
} else {
  console.log(`[sync-public-uploads] catalog ready (${copied} copied, ${CATALOG.length} total)`);
}
