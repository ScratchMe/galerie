// One-shot import: copies every photo of the Adobe Portfolio galleries into photos/<slug>/.
// Run while antoine.berthaud.me still points to Adobe Portfolio (GitHub Action "Importer depuis Adobe Portfolio").
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const config = JSON.parse(await fs.readFile(path.join(root, "galleries.json"), "utf8"));
const source = process.env.PORTFOLIO_URL || config.site.portfolioSource;
const MAX_EDGE = 2560;
const HEADERS = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", "accept-language": "fr-FR,fr;q=0.9" };
const report = [];
const log = (line) => { console.log(line); report.push(line); };
await fs.mkdir(path.join(root, "import-debug"), { recursive: true });

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
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (attempt === 3) throw new Error(`${res.status} on ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

let total = 0;
for (const gallery of config.galleries) {
  const pageUrl = `${source.replace(/\/$/, "")}/${gallery.slug}`;
  let html = "";
  try {
    const res = await fetch(pageUrl, { headers: HEADERS, redirect: "follow" });
    html = await res.text();
    log(`${gallery.slug}: HTTP ${res.status}, ${html.length} octets, url finale ${res.url}`);
  } catch (e) { log(`✗ ${gallery.slug}: ${e.message}`); continue; }
  const urls = extractPhotos(html);
  log(`  ${urls.length} photos trouvées${urls[0] ? ` (ex. ${urls[0]})` : ""}`);
  if (!urls.length) await fs.writeFile(path.join(root, "import-debug", `${gallery.slug}.html`), html);
  const dir = path.join(root, "photos", gallery.slug);
  await fs.mkdir(dir, { recursive: true });
  let n = 0;
  for (const url of urls) {
    n++;
    const target = path.join(dir, `${String(n).padStart(3, "0")}.jpg`);
    let input;
    try { input = await download(url); } catch (e) { log(`  ✗ ${e.message}`); n--; continue; }
    await sharp(input).rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(target);
  }
  total += n;
  log(`✓ ${gallery.slug}: ${n} photos enregistrées`);
}
log(`Total: ${total} photos`);
await fs.writeFile(path.join(root, "import-debug", "rapport.txt"), report.join("\n") + "\n");
if (total === 0) process.exit(1);
