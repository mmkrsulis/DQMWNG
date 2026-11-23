const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(".");
const out = path.resolve(root, "dist");
if (path.dirname(out) !== root || path.basename(out) !== "dist") {
  throw Error("Invalid build target");
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// Salin aset publik
const assets = fs
  .readdirSync("assets")
  .filter((p) => /\.(css|js)$/.test(p))
  .map((p) => "assets/" + p);

for (const p of ["index.html", ...assets, "data/monitoring.js"]) {
  fs.mkdirSync(path.dirname(path.join(out, p)), { recursive: true });
  fs.copyFileSync(p, path.join(out, p));
}

// Salin snapshot ATS live untuk aset ats-live.js
const atsSnapshot = path.join(root, "data/ats-live.json");
if (fs.existsSync(atsSnapshot)) {
  const target = path.join(out, "data/ats-live.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(atsSnapshot, target);
}

// Terapkan seluruh 6 referensi live (IKD, Master, DQM, Katalog, Residu, ATS) ke dist/
require("./apply-all-live.cjs").applyAllLiveToDist(root, out);

// Muat ats-live.js setelah overlay selesai
const indexPath = path.join(out, "index.html");
let html = fs.readFileSync(indexPath, "utf8");
if (!html.includes("assets/ats-live.js")) {
  const tag = '<script src="assets/ats-live.js"></script>';
  if (html.includes("</body>")) html = html.replace("</body>", tag + "</body>");
  else html = html.replace("</html>", tag + "</html>");
  fs.writeFileSync(indexPath, html);
}

console.log("Public presentation built in dist with all 6 live references.");
