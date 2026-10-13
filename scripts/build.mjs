// Builds the static site into _site/ from galleries.json and photos/<slug>/*.jpg.
// Adding a gallery = a folder of JPEGs in photos/ + one line in galleries.json.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, "_site");
const config = JSON.parse(await fs.readFile(path.join(root, "galleries.json"), "utf8"));
const { site } = config;
const WIDTHS = [720, 1440, 2400];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function listPhotos(slug) {
  try {
    const files = await fs.readdir(path.join(root, "photos", slug));
    return files.filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  } catch { return []; }
}

async function renderImage(slug, file, index) {
  const src = path.join(root, "photos", slug, file);
  const base = sharp(src).rotate();
  const meta = await base.metadata();
  const swap = (meta.orientation || 1) >= 5;
  const w = swap ? meta.height : meta.width;
  const h = swap ? meta.width : meta.height;
  const dir = path.join(out, slug, "img");
  await fs.mkdir(dir, { recursive: true });
  const id = String(index + 1).padStart(3, "0");
  const variants = [];
  for (const width of WIDTHS) {
    const real = Math.min(width, w);
    const name = `${id}-${width}.webp`;
    await sharp(src).rotate().resize({ width: real, withoutEnlargement: true }).webp({ quality: width === 720 ? 74 : 80 }).toFile(path.join(dir, name));
    variants.push({ width: real, url: `/${slug}/img/${name}` });
    if (real === w) break;
  }
  const jpeg = `${id}.jpg`;
  await sharp(src).rotate().resize({ width: Math.min(1600, w), withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(dir, jpeg));
  return { w, h, ratio: w / h, variants, jpeg: `/${slug}/img/${jpeg}` };
}

const srcset = (img) => img.variants.map((v) => `${v.url} ${v.width}w`).join(", ");
const large = (img) => img.variants[img.variants.length - 1].url;

function layout({ title, description, ogImage, canonical, body, scripts = "" }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="https://${site.domain}${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://${site.domain}${canonical}">
${ogImage ? `<meta property="og:image" content="https://${site.domain}${ogImage}">\n<meta name="twitter:card" content="summary_large_image">` : ""}
<meta name="theme-color" content="#f4f2ec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111311" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,500;7..72,600&family=Inter:wght@400;500&display=swap">
<link rel="stylesheet" href="/assets/style.css">
</head>
<body>
<header class="top">
  <a class="brand" href="/">${esc(site.name)}<span>Photos</span></a>
  <nav aria-label="Navigation principale"><a href="/">Galeries</a><a href="/contact/">Contact</a></nav>
</header>
${body}
<footer class="foot">
  <p>© ${new Date().getFullYear()} ${esc(site.name)} · Toutes les photos sont de moi, merci de me demander avant de les réutiliser.</p>
  <p><a href="${esc(site.cv)}">CV</a><a href="${esc(site.linkedin)}" rel="me">LinkedIn</a></p>
</footer>
${scripts}
</body>
</html>
`;
}

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, "assets"), { recursive: true });
for (const f of await fs.readdir(path.join(root, "assets"))) await fs.copyFile(path.join(root, "assets", f), path.join(out, "assets", f));

const built = [];
for (const g of config.galleries) {
  const files = await listPhotos(g.slug);
  if (!files.length) { console.warn(`· ${g.slug}: aucune photo, galerie ignorée`); continue; }
  const images = [];
  for (const [i, f] of files.entries()) images.push(await renderImage(g.slug, f, i));
  built.push({ ...g, images, cover: images[Math.min((g.cover || 1) - 1, images.length - 1)] });
  console.log(`✓ ${g.slug}: ${images.length}`);
}

for (const [i, g] of built.entries()) {
  const prev = built[(i - 1 + built.length) % built.length];
  const next = built[(i + 1) % built.length];
  const items = g.images.map((img, n) => `<a class="ph" href="${large(img)}" data-index="${n}" style="--r:${img.ratio.toFixed(4)}"><img src="${img.variants[0].url}" srcset="${srcset(img)}" sizes="(max-width: 700px) 100vw, 50vw" width="${img.w}" height="${img.h}" alt="${esc(g.title)}, photo ${n + 1} sur ${g.images.length}" loading="${n < 6 ? "eager" : "lazy"}" decoding="async"></a>`).join("\n");
  const data = JSON.stringify(g.images.map((img) => ({ s: srcset(img), u: large(img), w: img.w, h: img.h })));
  const body = `<main class="gallery">
  <div class="intro">
    <p class="kicker"><a href="/">Galeries</a> · ${g.year}</p>
    <h1>${esc(g.title)}</h1>
    <p class="count">${g.images.length} photos</p>
  </div>
  <div class="justified">
${items}
  </div>
  <nav class="pager" aria-label="Autres galeries">
    <a href="/${prev.slug}/"><span>Précédente</span>${esc(prev.title)}</a>
    <a href="/${next.slug}/"><span>Suivante</span>${esc(next.title)}</a>
  </nav>
</main>
<dialog class="lb" aria-label="Visionneuse">
  <figure><img alt=""><figcaption></figcaption></figure>
  <button class="lb-close" type="button" aria-label="Fermer">×</button>
  <button class="lb-prev" type="button" aria-label="Photo précédente">‹</button>
  <button class="lb-next" type="button" aria-label="Photo suivante">›</button>
</dialog>`;
  const html = layout({
    title: `${g.title} — ${site.name}`,
    description: `${g.title}, ${g.year} : ${g.images.length} photos d’${site.name}.`,
    ogImage: g.cover.jpeg,
    canonical: `/${g.slug}/`,
    body,
    scripts: `<script>window.PHOTOS=${data};window.GTITLE=${JSON.stringify(g.title)};</script>\n<script src="/assets/lightbox.js" defer></script>`,
  });
  await fs.mkdir(path.join(out, g.slug), { recursive: true });
  await fs.writeFile(path.join(out, g.slug, "index.html"), html);
}

const cards = built.map((g, i) => `<a class="card" href="/${g.slug}/">
  <img src="${g.cover.variants[0].url}" srcset="${srcset(g.cover)}" sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw" alt="" loading="${i < 6 ? "eager" : "lazy"}" decoding="async" width="${g.cover.w}" height="${g.cover.h}">
  <span class="card-t">${esc(g.title)}</span><span class="card-m">${g.year} · ${g.images.length} photos</span>
</a>`).join("\n");

await fs.writeFile(path.join(out, "index.html"), layout({
  title: site.title,
  description: site.intro,
  ogImage: built[0]?.cover.jpeg,
  canonical: "/",
  body: `<main class="home">
  <section class="hero"><h1>Des villes, de la pierre<br>et de la lumière.</h1><p>${esc(site.intro)}</p></section>
  <section class="cards" aria-label="Galeries">
${cards}
  </section>
</main>`,
}));

await fs.mkdir(path.join(out, "contact"), { recursive: true });
await fs.writeFile(path.join(out, "contact", "index.html"), layout({
  title: `Contact — ${site.name}`,
  description: `Contacter ${site.name}.`,
  canonical: "/contact/",
  body: `<main class="page">
  <h1>Contact</h1>
  <p>Une photo vous plaît, vous voulez l’utiliser ou simplement en parler ? Le plus simple est de m’écrire sur LinkedIn.</p>
  <p class="links"><a class="btn" href="${esc(site.linkedin)}">M’écrire sur LinkedIn</a><a class="btn ghost" href="${esc(site.cv)}">Voir mon CV</a></p>
</main>`,
}));

await fs.writeFile(path.join(out, "404.html"), layout({
  title: `Page introuvable — ${site.name}`,
  description: "Cette page n’existe pas.",
  canonical: "/404.html",
  body: `<main class="page"><h1>Cette page s’est perdue en chemin.</h1><p><a class="btn" href="/">Revenir aux galeries</a></p></main>`,
}));

await fs.writeFile(path.join(out, "CNAME"), `${site.domain}\n`);
await fs.writeFile(path.join(out, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: https://${site.domain}/sitemap.xml\n`);
await fs.writeFile(path.join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${["/", ...built.map((g) => `/${g.slug}/`), "/contact/"].map((u) => `  <url><loc>https://${site.domain}${u}</loc></url>`).join("\n")}\n</urlset>\n`);
console.log(`Site prêt : ${built.length} galeries, ${built.reduce((n, g) => n + g.images.length, 0)} photos.`);
