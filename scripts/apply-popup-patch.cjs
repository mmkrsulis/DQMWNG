const fs = require("node:fs");
const path = require("node:path");

function cleanAudienceCopy(html) {
  const replacements = [
    // 1. Slide Pembuka: rapikan catatan kaki internal pengelola
    [
      /<small>\*Konfirmasi pengelola[^<]*<\/small>/g,
      "<small>Sumber: Rekap resmi IKD &amp; DQM Kabupaten Wonogiri.</small>"
    ],
    // 2. Slide IKD sekolah: hilangkan catatan perilaku UI ("Nilai kosong ditulis...")
    [
      /Sekolah tanpa nilai tetap dapat dicari\. Nilai kosong ditulis “Belum tersedia”\./g,
      "Sekolah yang belum memiliki nilai IKD tetap dapat dicari untuk melihat rincian DQM dan profil Dapodik."
    ],
    // 3. Slide Masalah DQM kabupaten: perjelas maksud status manual
    [
      /Status manual tidak mengubah hasil pengukuran\./g,
      "Catatan tindak lanjut berfungsi sebagai pengingat operator; perubahan skor terjadi setelah pembaruan di aplikasi sumber diproses."
    ],
    // 4. Slide Fokus SD: perbaiki typo pengulangan kata "pada data tersimpan data"
    [
      /berasal dari 746 SD pada data tersimpan data\./g,
      "berasal dari 746 SD di Kabupaten Wonogiri."
    ],
    // 5. Slide Potret Residu PD & Residu per jenjang: ubah frasa "data tersimpan" menjadi "rekap resmi per"
    [
      /Data tersimpan rekap VervalPD tanggal/g,
      "Rekap resmi VervalPD per"
    ],
    [
      /bersumber dari data tersimpan /g,
      "bersumber dari rekap resmi per "
    ],
    // 6. Slide Rekap ATS: bersihkan judul & kalimat bernuansa catatan internal
    [
      /Jumlah mengikuti rekap yang tersedia; belum ada total pembanding untuk pengecekan\./g,
      "Cakupan 25 kecamatan berdasarkan rekap resmi yang tersedia."
    ],
    [
      /<h2>Periksa sebelum menindaklanjuti<\/h2><p>Konfirmasikan status pendidikan dan tindak lanjut melalui petugas berwenang\. Rekap ATS ini disajikan terpisah dan tidak digunakan untuk menghitung skor IKD atau DQM pada presentasi\.<\/p>/g,
      "<h2>Keterangan data ATS</h2><p>Konfirmasikan status pendidikan dan tindak lanjut anak tidak sekolah bersama dinas serta perangkat desa atau kecamatan. Rekap ATS disajikan terpisah dan tidak memengaruhi perhitungan skor IKD maupun DQM satuan pendidikan.</p>"
    ],
    [
      /<p class="note" style="margin-top:20px">Halaman ini hanya menampilkan jumlah per kelompok\. Identitas anak tidak ditampilkan\.<\/p>/g,
      ""
    ],
    // 7. Slide Cakupan lima sumber: hapus catatan kendala teknis/bug internal tim data
    [
      /<div class="insight warn">Riwayat IKD tersedia, tetapi label periode pada rekap terpotong[\s\S]*?<\/div>/g,
      '<div class="insight warn">Capaian IKD antarperiode tidak dibandingkan secara langsung karena penyesuaian variabel penilaian pada setiap semester. Perubahan angka persentase belum tentu mencerminkan penurunan kualitas data satuan pendidikan.</div>'
    ],
    // 8. Slide Praktik 20 menit: ubah kalimat skrip fasilitator menjadi panduan peserta
    [
      /Latihan bagi seluruh operator yang hadir, bukan hanya SD dalam daftar 50 terendah\. Fasilitator memandu dan peserta mencatat masalah prioritas sekolah masing-masing\./g,
      "Setiap operator memeriksa data sekolah masing-masing secara langsung dan mencatat indikator prioritas untuk ditindaklanjuti."
    ]
  ];

  for (const [pattern, replacement] of replacements) {
    html = html.replace(pattern, replacement);
  }
  return html;
}

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

  html = cleanAudienceCopy(html);

  if (!html.includes("assets/popup-polish.css")) {
    html = html.replace(
      "</head>",
      '  <link rel="stylesheet" href="assets/popup-polish.css"/>\n</head>'
    );
  }
  if (!html.includes("assets/adaptive-layout.css")) {
    html = html.replace(
      "</head>",
      '  <link rel="stylesheet" href="assets/adaptive-layout.css"/>\n</head>'
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
  console.log("Patch Slide 2, Adaptive Typography, Pop-Up UI & Copywriting berhasil diterapkan ke index.html");
}

module.exports = { applyPopupPatchToHtml, cleanAudienceCopy };
