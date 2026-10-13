import fs from "node:fs/promises";
const UA = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" };
const og = "https://cdn.myportfolio.com/54708f55-4c39-484e-a46a-cde20763c554/87da22ac-187a-44f7-9d64-0beca845d35f_car_4x3.jpg?h=b3c50421d354ac3e8705cf1e0ea4eb80";
const tests = [
  ["page directe", "https://antoine.berthaud.me/rome", UA],
  ["jina html", "https://r.jina.ai/https://antoine.berthaud.me/rome", { ...UA, "x-return-format": "html" }],
  ["jina markdown", "https://r.jina.ai/https://antoine.berthaud.me/rome", UA],
  ["cdn direct", og, UA],
  ["wsrv", `https://wsrv.nl/?url=${encodeURIComponent(og)}`, UA],
];
const out = [];
for (const [name, url, headers] of tests) {
  try {
    const r = await fetch(url, { headers });
    const buf = Buffer.from(await r.arrayBuffer());
    const txt = buf.toString("utf8");
    const n = (txt.match(/cdn\.myportfolio\.com\/[0-9a-f-]{36}\/[0-9a-f-]{36}[^"'\s)]*/g) || []).length;
    out.push(`${name}: ${r.status} ${buf.length} octets, ${n} urls cdn, type ${r.headers.get("content-type")}`);
    if (name.startsWith("jina")) await fs.writeFile(`probe-${name.replace(" ", "-")}.txt`, txt.slice(0, 200000));
  } catch (e) { out.push(`${name}: erreur ${e.message}`); }
}
await fs.writeFile("probe-result.txt", out.join("\n") + "\n");
console.log(out.join("\n"));
