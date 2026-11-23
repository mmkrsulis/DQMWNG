const fs = require("node:fs");
const path = require("node:path");

function applyPopupPatchToHtml(html) {
  const slideRe = /<section\b[^>]*class="[^"]*\bslide\b[^"]*"[^>]*>[\s\S]*?<\/section>/g;
  const matches = [...html.matchAll(slideRe)];

  const coverIdx = matches.findIndex((m) => m[0].includes('data-label="Pembuka"'));
  const jatengIdx = matches.findIndex((m) => m[0].includes('data-label="Capaian IKD Jawa Tengah"'));

  if (coverIdx >= 0 && jatengIdx > coverIdx + 1) {
    const coverHtml = matches[coverIdx][0];
    const jatengHtml = matches[jatengIdx][0];
    html = html.replace(jatengHtml, "");
    html = html.replace(coverHtml, `${coverHtml}\n${jatengHtml}`);

    // Perbarui nomor urut <div class="slide-no">XX / YY</div> pada setiap slide
    const reordered = [...html.matchAll(slideRe)];
    const total = reordered.length;
    let cursor = 0;
    let out = "";
    reordered.forEach((m, idx) => {
      out += html.slice(cursor, m.index);
      const slideNoStr = `${String(idx + 1).padStart(2, "0")} / ${total}`;
      const updatedBlock = m[0].replace(
        /<div class="slide-no">[^<]*<\/div>/,
        `<div class="slide-no">${slideNoStr}</div>`
      );
      out += updatedBlock;
      cursor = m.index + m[0].length;
    });
    out += html.slice(cursor);
    html = out;
  }

  if (!html.includes("assets/popup-polish.css")) {
    html = html.replace(
      "</head>",
      '  <link rel="stylesheet" href="assets/popup-polish.css"/>\n</head>'
    );
  }
  if (!html.includes("assets/popup-polish.js")) {
    html = html.replace(
      "</body>",
      '  <script src="assets/popup-polish.js"></script>\n</body>'
    );
  }

  return html;
}

if (require.main === module) {
  const target = path.resolve("index.html");
  const updated = applyPopupPatchToHtml(fs.readFileSync(target, "utf8"));
  fs.writeFileSync(target, updated, "utf8");
  console.log("Patch Slide 2 & Pop-Up UI berhasil diterapkan ke index.html");
}

module.exports = { applyPopupPatchToHtml };
