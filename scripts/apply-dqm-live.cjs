const fs = require("node:fs");

function setExisting(target, aliases, value) {
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      target[key] = typeof target[key] === "string" ? String(value) : value;
    }
  }
}

function applyDqmLiveToHtml(html, snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.records)) {
    throw new Error("Format data/dqm-live.json tidak valid.");
  }
  const re = /(<script\b(?=[^>]*\bid=["']ikd-data["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>)([\s\S]*?)(<\/script>)/i;
  const match = html.match(re);
  if (!match) throw new Error('Blok JSON <script id="ikd-data"> tidak ditemukan.');

  const data = JSON.parse(match[2]);
  if (!Array.isArray(data.schools)) throw new Error("ikd-data.schools bukan array.");
  const byNpsn = new Map(snapshot.records.map(r => [String(r.npsn), r]));
  let updated = 0;

  for (const school of data.schools) {
    const npsn = String(school.n ?? school.npsn ?? "");
    const live = byNpsn.get(npsn);
    if (!live) continue;
    setExisting(school, ["score"], live.score);
    setExisting(school, ["category", "kategori"], live.category);
    setExisting(school, ["evaluated", "dievaluasi"], live.evaluated);
    setExisting(school, ["pass", "lolos"], live.pass);
    setExisting(school, ["fail", "gagal"], live.fail);
    setExisting(school, ["unevaluated", "belumDievaluasi", "pending"], live.unevaluated);
    setExisting(school, ["active", "total", "totalActive", "totalAktif"], live.total);
    updated++;
  }

  const ratio = updated / Math.max(1, snapshot.records.length);
  if (updated === 0 || ratio < 0.8) {
    throw new Error(`Overlay DQM hanya cocok ${updated}/${snapshot.records.length} sekolah; build dihentikan.`);
  }
  const replacement = `${match[1]}${JSON.stringify(data)}${match[3]}`;
  return {
    html: html.replace(re, replacement),
    updated,
    records: snapshot.records.length
  };
}

function applyDqmLiveFile(htmlPath, dataPath) {
  if (!fs.existsSync(dataPath)) {
    console.log("DQM live belum tersedia; build memakai snapshot yang tertanam.");
    return { updated: 0, skipped: true };
  }
  const html = fs.readFileSync(htmlPath, "utf8");
  const snapshot = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const result = applyDqmLiveToHtml(html, snapshot);
  fs.writeFileSync(htmlPath, result.html);
  console.log(`Overlay DQM diterapkan: ${result.updated}/${result.records} sekolah.`);
  return result;
}

module.exports = { applyDqmLiveFile, applyDqmLiveToHtml };
