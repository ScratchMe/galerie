// One-shot import: copies every photo of the Adobe Portfolio galleries into photos/<slug>/.
// Run while antoine.berthaud.me still points to Adobe Portfolio (GitHub Action "Importer depuis Adobe Portfolio").
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const config = JSON.parse(await fs.readFile(path.join(root, "galleries.json"), "utf8"));
const source = process.env.PORTFOLIO_URL || config.site.portfolioSource;
const MAX_EDGE = 2560;

const URL_RE = /https:\/\/cdn\.myportfolio\.com\/([0-9a-f-]{36})\/([0-9a-f-]{36})(?:_([a-z]+)(?:_([0-9x]+))?)?\.(jpe?g|png|webp|gif)(?:\?h=[0-9a-f]+)?/gi;

// Rank a Portfolio variant: the untouched original first, then the widest resized copy.
// Cover crops ("car", "carw") belong to gallery thumbnails, never to the gallery itself.
function rank(variant, size) {
  if (!variant) return 100000;
  if (variant === "car" || variant === "carw") return -1;
  const width = Number(String(size || "0").split("x")[0]) || 0;
  if (variant === "rw") return 10000 + width;
  if (variant === "rwc") return 5000 + width;
  return width;
}

function extractPhotos(html) {
  const decoded = html.replace(/&amp;/g, "&").replace(/\\\//g, "/");
  const best = new Map();
  const order = [];
  for (const m of decoded.matchAll(URL_RE)) {
    const [url, , imageId, variant, size] = m;
    const score = rank(variant, size);
    if (score < 0) continue;
    if (!best.has(imageId)) order.push(imageId);
    const current = best.get(imageId);
    if (!current || score > current.score) best.set(imageId, { url, score });
  }
  return order.map((id) => best.get(id).url);
}

async function download(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (attempt === 3) throw new Error(`${res.status} on ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

let total = 0;
for (const gallery of config.galleries) {
  const pageUrl = `${source.replace(/\/$/, "")}/${gallery.slug}`;
  const res = await fetch(pageUrl);
  if (!res.ok) { console.error(`✗ ${gallery.slug}: page ${res.status}`); process.exitCode = 1; continue; }
  const urls = extractPhotos(await res.text());
  const dir = path.join(root, "photos", gallery.slug);
  await fs.mkdir(dir, { recursive: true });
  let n = 0;
  for (const url of urls) {
    n++;
    const target = path.join(dir, `${String(n).padStart(3, "0")}.jpg`);
    const input = await download(url);
    await sharp(input).rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(target);
  }
  total += n;
  console.log(`✓ ${gallery.slug}: ${n} photos`);
}
console.log(`Total: ${total} photos`);
if (total === 0) process.exit(1);
