const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const BULAN_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

function formatTanggalIndo(isoOrWib) {
  const d = new Date(isoOrWib);
  if (Number.isNaN(d.getTime())) return "23 November 2026";
  const wib = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${wib.getUTCDate()} ${BULAN_ID[wib.getUTCMonth()]} ${wib.getUTCFullYear()}`;
}

function formatTanggalSlash(isoOrWib) {
  const d = new Date(isoOrWib);
  if (Number.isNaN(d.getTime())) return "23/11/2026";
  const wib = new Date(d.getTime() + 7 * 3600 * 1000);
  const dd = String(wib.getUTCDate()).padStart(2, "0");
  const mm = String(wib.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${wib.getUTCFullYear()}`;
}

function round2(n) {
  return n === null || n === undefined ? null : Math.round(Number(n) * 100) / 100;
}

function decId(n, d = 2) {
  return Number(n || 0).toLocaleString("id-ID", {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  });
}

function fmtId(n) {
  return Number(n || 0).toLocaleString("id-ID");
}

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function cleanDistrict(name) {
  return String(name || "").replace(/^Kec\.\s*/i, "").trim();
}

function buildLiveMonitoring(baseMonitoringJs, live) {
  const ctx = { window: {} };
  vm.runInNewContext(baseMonitoringJs, ctx);
  const snap = ctx.window.MONITOR_SNAPSHOT;

  // 1. IKD Resmi Wilayah, Peringkat Jateng & Sekolah (ikd-wonogiri-live.json)
  if (live.ikd && live.ikd.wonogiri_ringkasan) {
    const w = live.ikd.wonogiri_ringkasan;
    const sortedJateng = [...(live.ikd.peringkat_jateng || [])].sort(
      (a, b) => Number(b.total || 0) - Number(a.total || 0)
    );
    const rankIdx = sortedJateng.findIndex((r) =>
      String(r.kabupaten || "").toLowerCase().includes("wonogiri")
    );

    snap.official = {
      score: round2(w.total),
      complete: round2(w.kelengkapan),
      valid: round2(w.validitas),
      current: round2(w.mutakhir),
      rank: rankIdx >= 0 ? rankIdx + 1 : snap.official.rank,
      totalRegions: sortedJateng.length || 35,
      at: live.ikd.synced_at_wib || live.ikd.synced_at || snap.official.at,
      url: "https://dapo.kemendikdasmen.go.id/ikd/Prov.%20Jawa%20Tengah"
    };

    if (Array.isArray(live.ikd.sekolah) && live.ikd.sekolah.length > 0) {
      const ikdMap = {};
      for (const s of live.ikd.sekolah) {
        const npsn = String(s.npsn || "").trim().toUpperCase();
        if (!npsn) continue;
        ikdMap[npsn] = {
          n: npsn,
          name: s.nama,
          level: s.bentuk_pendidikan || s.jenjang,
          district: cleanDistrict(s.kecamatan) || null,
          complete: round2(s.kelengkapan),
          valid: round2(s.validitas),
          current: round2(s.mutakhir),
          score: round2(s.total),
          url: "https://dapo.kemendikdasmen.go.id/ikd/Prov.%20Jawa%20Tengah/Kab.%20Wonogiri",
          at: live.ikd.synced_at_wib || live.ikd.synced_at
        };
      }
      snap.schools = ikdMap;
    }
    snap.retrievedAt = live.ikd.synced_at || snap.retrievedAt;
  }

  // 2. Master Sekolah (master-sekolah-live.json)
  if (live.master && Array.isArray(live.master.schools) && live.master.schools.length > 0) {
    const masterMap = {};
    for (const s of live.master.schools) {
      const npsn = String(s.npsn || "").trim().toUpperCase();
      if (!npsn) continue;
      const minRaw = String(s.kementerian_pembina || "").trim();
      const ministry =
        minRaw === "Kementerian Agama"
          ? "Kemenag"
          : minRaw === "Kementerian Pendidikan Dasar dan Menengah"
            ? "Kemendikdasmen"
            : minRaw || "Kemendikdasmen";
      masterMap[npsn] = {
        n: npsn,
        name: s.nama,
        level: s.bentuk_pendidikan || s.jenjang_pendidikan,
        district: cleanDistrict(s.kecamatan),
        ministry
      };
    }
    snap.master = masterMap;
  }

  // 3. Tanggal DQM per sekolah (dqm-live.json)
  if (live.dqm && Array.isArray(live.dqm.records)) {
    const dqmSlash = formatTanggalSlash(live.dqm.retrievedAt);
    snap.dqmDates = snap.dqmDates || {};
    for (const r of live.dqm.records) {
      const npsn = String(r.npsn || "").trim().toUpperCase();
      if (npsn) snap.dqmDates[npsn] = dqmSlash;
    }
    if (live.dqm.retrievedAt && live.dqm.retrievedAt > snap.retrievedAt) {
      snap.retrievedAt = live.dqm.retrievedAt;
    }
  }

  // 4. Residu Peserta Didik (residu-live.json)
  if (live.residu && Array.isArray(live.residu.schools)) {
    const levels = {};
    const keys = [
      "nisn", "nik_dukcapil", "nik_ganda", "nama", "tempat_lahir",
      "tanggal_lahir", "ibu_kandung", "desa_kelurahan", "residu_validasi"
    ];
    for (const row of live.residu.schools) {
      const lv = String(row.jenjang || "Lainnya").trim();
      if (!levels[lv]) levels[lv] = { schools: 0, values: new Array(keys.length).fill(0) };
      levels[lv].schools += 1;
      const r = row.residu || {};
      keys.forEach((k, idx) => {
        levels[lv].values[idx] += Number(r[k] || 0);
      });
    }
    const snapDate =
      live.residu.meta?.fetched_at_wib?.slice(0, 10) ||
      live.residu.meta?.fetched_at_utc?.slice(0, 10) ||
      "2026-11-23";
    snap.residu = {
      snapshot: snapDate,
      schoolRows: live.residu.summary?.total_sekolah_terdata ?? live.residu.schools.length,
      labels: [
        "NISN", "NIK Dukcapil", "NIK ganda", "Nama", "Tempat lahir",
        "Tanggal lahir", "Ibu kandung", "Desa/Kelurahan", "Residu Validasi (rekap)"
      ],
      levels
    };
  }

  // 5. Anak Tidak Sekolah (ats-live.json)
  if (live.ats && live.ats.totals && Array.isArray(live.ats.kecamatan)) {
    snap.ats = {
      total: live.ats.totals.total,
      do: live.ats.totals.do,
      ltm: live.ats.totals.ltm,
      bpb: live.ats.totals.bpb,
      withoutNisn: 0,
      at: formatTanggalSlash(live.ats.meta?.fetched_at_wib || live.ats.meta?.fetched_at_utc),
      status: live.ats.validation?.status || "VALID",
      districts: live.ats.kecamatan.map((k) => ({
        name: cleanDistrict(k.kecamatan),
        total: k.total,
        verified: 0
      }))
    };
  }

  return `window.MONITOR_SNAPSHOT=${JSON.stringify(snap)};\n`;
}

function applyAllLiveToHtml(html, live, snap) {
  const ikdDateIndo = formatTanggalIndo(live.ikd?.synced_at_wib || live.ikd?.synced_at);
  const dqmDateIndo = formatTanggalIndo(live.dqm?.retrievedAt);
  const masterDateIndo = formatTanggalIndo(live.master?.meta?.fetched_at_wib || live.master?.meta?.fetched_at_utc);
  const residuDateIndo = formatTanggalIndo(live.residu?.meta?.fetched_at_wib || live.residu?.meta?.fetched_at_utc);
  const residuSlash = formatTanggalSlash(live.residu?.meta?.fetched_at_wib || live.residu?.meta?.fetched_at_utc);
  const atsDateIndo = formatTanggalIndo(live.ats?.meta?.fetched_at_wib || live.ats?.meta?.fetched_at_utc);

  // A. Update <script id="ikd-data">
  const ikdRe = /(<script\b(?=[^>]*\bid=["']ikd-data["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>)([\s\S]*?)(<\/script>)/i;
  const ikdMatch = html.match(ikdRe);
  if (!ikdMatch) throw new Error('Blok JSON <script id="ikd-data"> tidak ditemukan.');

  const ikdJson = JSON.parse(ikdMatch[2]);
  if (live.dqm && Array.isArray(live.dqm.records)) {
    const byNpsn = new Map(live.dqm.records.map((r) => [String(r.npsn).trim().toUpperCase(), r]));
    const existingNpsn = new Set();

    for (const s of ikdJson.schools) {
      const npsn = String(s.n ?? s.npsn ?? "").trim().toUpperCase();
      existingNpsn.add(npsn);
      const r = byNpsn.get(npsn);
      if (!r) continue;
      s.score = r.score;
      s.category = r.category;
      s.evaluated = r.evaluated;
      s.pass = r.pass;
      s.fail = r.fail;
      s.unevaluated = r.unevaluated;
      s.active = r.total;
      s.computed = live.dqm.retrievedAt;
      if (r.profileUrl) s.url = r.profileUrl;
    }

    for (const r of live.dqm.records) {
      const npsn = String(r.npsn).trim().toUpperCase();
      if (existingNpsn.has(npsn)) continue;
      ikdJson.schools.push({
        n: npsn,
        u: r.uuid || "",
        name: r.name,
        level: r.form,
        district: cleanDistrict(r.district),
        ministry: "Kemendikdasmen",
        url: r.profileUrl || "",
        crawl: "OK",
        score: r.score,
        category: r.category,
        evaluated: r.evaluated,
        pass: r.pass,
        fail: r.fail,
        unevaluated: r.unevaluated,
        active: r.total,
        computed: live.dqm.retrievedAt,
        dims: {
          Kelengkapan: { score: r.score, evaluated: r.evaluated, pass: r.pass, unevaluated: r.unevaluated, active: r.total, category: r.category },
          Keunikan: { score: r.score, evaluated: 0, pass: 0, unevaluated: 0, active: 0, category: r.category },
          Koherensi: { score: r.score, evaluated: 0, pass: 0, unevaluated: 0, active: 0, category: r.category },
          Validitas: { score: r.score, evaluated: 0, pass: 0, unevaluated: 0, active: 0, category: r.category }
        },
        status: "P".repeat(r.pass) + "F".repeat(r.fail) + "B".repeat(r.unevaluated)
      });
    }

    ikdJson.priority = ikdJson.schools
      .filter((s) => s.level === "SD" && typeof s.score === "number")
      .sort((a, b) => a.score - b.score || b.fail - a.fail || String(a.n).localeCompare(String(b.n)))
      .slice(0, 50)
      .map((s) => s.n);

    if (ikdJson.meta) {
      ikdJson.meta.date = dqmDateIndo;
      ikdJson.meta.schoolCount = ikdJson.schools.length;
      ikdJson.meta.validCount = ikdJson.schools.length;
      if (live.catalog?.meta?.record_count) {
        ikdJson.meta.indicatorCount = live.catalog.meta.record_count;
      }
    }
  }
  html = html.replace(ikdRe, `${ikdMatch[1]}${JSON.stringify(ikdJson)}${ikdMatch[3]}`);

  // B. Update <script id="residu-data">
  if (snap.residu) {
    const resRe = /(<script\b(?=[^>]*\bid=["']residu-data["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>)([\s\S]*?)(<\/script>)/i;
    if (resRe.test(html)) {
      html = html.replace(resRe, `$1${JSON.stringify(snap.residu)}$3`);
    }
  }

  // C. Perbarui angka, peringkat IKD Jateng, dan tanggal statis pada seluruh slide HTML
  const scoreStr = decId(snap.official.score, 2);
  const compStr = decId(snap.official.complete, 2);
  const valStr = decId(snap.official.valid, 2);
  const curStr = decId(snap.official.current, 2);
  const rankNum = snap.official.rank || 1;
  const totalReg = snap.official.totalRegions || 35;

  const comps = [
    { cls: "complete", key: "kelengkapan", label: "Kelengkapan", val: snap.official.complete, str: compStr },
    { cls: "valid", key: "validitas", label: "Validitas", val: snap.official.valid, str: valStr },
    { cls: "current", key: "kemutakhiran", label: "Kemutakhiran", val: snap.official.current, str: curStr }
  ];
  const lowestComp = [...comps].sort((a, b) => a.val - b.val)[0];

  // Slide 1 (Pembuka), Slide 4 (Alur kebijakan), Slide 13 (Cakupan kabupaten)
  html = html.replace(/85,00<small>%<\/small>/g, `${scoreStr}<small>%</small>`);
  html = html.replace(/Peringkat 1 di Jawa Tengah\*/g, `Peringkat ${rankNum} dari ${totalReg} Kab/Kota Jawa Tengah`);
  html = html.replace(/Skor wilayah Wonogiri: <b>85,00%<\/b>/g, `Skor wilayah Wonogiri: <b>${scoreStr}%</b>`);
  html = html.replace(/Skor Kabupaten Wonogiri <strong>85,00%<\/strong>/g, `Skor Kabupaten Wonogiri <strong>${scoreStr}%</strong>`);
  html = html.replace(
    /\*Konfirmasi pengelola 27 Okt 2026\. Skor IKD: rekap 26 Okt 2026\./g,
    `Rekap resmi IKD (${ikdDateIndo}) &amp; DQM (${dqmDateIndo}) Kab. Wonogiri.`
  );

  // Slide 14 (Capaian IKD Jawa Tengah + Peringkat Resmi)
  html = html.replace(
    /Wonogiri peringkat <span class="accent">1 di Jawa Tengah<\/span>/g,
    `Wonogiri peringkat <span class="accent">${rankNum} di Jawa Tengah</span>`
  );
  html = html.replace(
    /<div class="ikd-achievement"><span aria-hidden="true">★<\/span> Peringkat 1 Jawa Tengah<\/div>/g,
    `<div class="ikd-achievement"><span aria-hidden="true">★</span> Peringkat ${rankNum} dari ${totalReg} Kab/Kota Jawa Tengah</div>`
  );
  html = html.replace(
    /Kemutakhiran menjadi fokus perbaikan\. Nilai bersumber dari rekap IKD resmi, terpisah dari skor DQM sekolah\./g,
    `${lowestComp.label} menjadi fokus perbaikan. Nilai dan peringkat bersumber dari rekap IKD resmi Jawa Tengah, terpisah dari skor DQM sekolah.`
  );
  html = html.replace(/data-number="85,00">85,00<\/strong>/g, `data-number="${scoreStr}">${scoreStr}</strong>`);
  html = html.replace(/aria-label="Skor IKD 85,00 persen"/g, `aria-label="Skor IKD ${scoreStr} persen"`);
  html = html.replace(/style="--target:85%"/g, `style="--target:${snap.official.score}%"`);

  const compNote = lowestComp.cls === "complete" ? "<small>Komponen terendah · perlu pembaruan data</small>" : "";
  const valNote = lowestComp.cls === "valid" ? "<small>Komponen terendah · perlu pembaruan data</small>" : "";
  const curNote = lowestComp.cls === "current" ? "<small>Komponen terendah · perlu pembaruan data</small>" : "";

  html = html.replace(
    /<div class="ikd-indicator-card complete"><div><span class="ikd-indicator-icon">▣<\/span><span>KELENGKAPAN<\/span><\/div><strong>91,37%<\/strong><div class="ikd-mini-track"><span style="--target:91\.37%"><\/span><\/div><\/div>/g,
    `<div class="ikd-indicator-card complete"><div><span class="ikd-indicator-icon">▣</span><span>KELENGKAPAN</span></div><strong>${compStr}%</strong><div class="ikd-mini-track"><span style="--target:${snap.official.complete}%"></span></div>${compNote}</div>`
  );
  html = html.replace(
    /<div class="ikd-indicator-card valid"><div><span class="ikd-indicator-icon">✓<\/span><span>VALIDITAS<\/span><\/div><strong>86,55%<\/strong><div class="ikd-mini-track"><span style="--target:86\.55%"><\/span><\/div><\/div>/g,
    `<div class="ikd-indicator-card valid"><div><span class="ikd-indicator-icon">✓</span><span>VALIDITAS</span></div><strong>${valStr}%</strong><div class="ikd-mini-track"><span style="--target:${snap.official.valid}%"></span></div>${valNote}</div>`
  );
  html = html.replace(
    /<div class="ikd-indicator-card current"><div><span class="ikd-indicator-icon">↻<\/span><span>KEMUTAKHIRAN<\/span><\/div><strong>76,57%<\/strong><div class="ikd-mini-track"><span style="--target:76\.57%"><\/span><\/div><small>Komponen terendah · perlu pembaruan data<\/small><\/div>/g,
    `<div class="ikd-indicator-card current"><div><span class="ikd-indicator-icon">↻</span><span>KEMUTAKHIRAN</span></div><strong>${curStr}%</strong><div class="ikd-mini-track"><span style="--target:${snap.official.current}%"></span></div>${curNote}</div>`
  );
  html = html.replace(
    /<strong>Prioritas pembinaan:<\/strong> kemutakhiran 76,57% merupakan komponen terendah\./g,
    `<strong>Prioritas pembinaan:</strong> ${lowestComp.key} ${lowestComp.str}% merupakan komponen terendah.`
  );

  // Slide 28 (Potret Residu PD)
  if (live.residu && live.residu.summary) {
    const ind = live.residu.summary.indikator || {};
    html = html.replace(
      /<div class="kpi-label">Baris satuan pendidikan<\/div><div class="kpi">333<\/div>/g,
      `<div class="kpi-label">Baris satuan pendidikan</div><div class="kpi">${fmtId(live.residu.summary.total_sekolah_terdata)}</div>`
    );
    html = html.replace(
      /<div class="kpi-label">NIK tidak padan Dukcapil<\/div><div class="kpi blue">1\.194<\/div>/g,
      `<div class="kpi-label">NIK tidak padan Dukcapil</div><div class="kpi blue">${fmtId(ind.nik_dukcapil)}</div>`
    );
    html = html.replace(
      /<div class="kpi-label">NIK ganda<\/div><div class="kpi rose">358<\/div>/g,
      `<div class="kpi-label">NIK ganda</div><div class="kpi rose">${fmtId(ind.nik_ganda)}</div>`
    );
    html = html.replace(
      /<div class="kpi-label">Residu NISN<\/div><div class="kpi goldtext">152<\/div>/g,
      `<div class="kpi-label">Residu NISN</div><div class="kpi goldtext">${fmtId(ind.nisn)}</div>`
    );
  }

  // Penyelarasan seluruh tanggal snapshot pada teks slide
  html = html.replace(/IKD 26 Oktober 2026/g, `IKD ${ikdDateIndo}`);
  html = html.replace(/IKD 26 Oktober/g, `IKD ${ikdDateIndo}`);
  html = html.replace(/DQM 22–23 Oktober 2026/g, `DQM ${dqmDateIndo}`);
  html = html.replace(/data 22–23 Oktober 2026/g, `data ${dqmDateIndo}`);
  html = html.replace(/DQM diambil 23 Oktober; residu VervalPD dari 26 Oktober/g, `DQM diambil ${dqmDateIndo}; residu VervalPD dari ${residuDateIndo}`);
  html = html.replace(/Data per 26 Oktober 2026/g, `Data per ${ikdDateIndo}`);
  html = html.replace(/IKD RESMI WILAYAH · 26 Oktober 2026/g, `IKD RESMI WILAYAH · ${ikdDateIndo}`);
  html = html.replace(/Data tersimpan 26 Oktober 2026/g, `Data tersimpan ${ikdDateIndo}`);
  html = html.replace(/Data tersimpan · 26 Oktober 2026/g, `Data tersimpan · ${ikdDateIndo}`);
  html = html.replace(/Daftar referensi 15 Oktober 2026/g, `Daftar referensi ${masterDateIndo}`);
  html = html.replace(/tanggal <strong>26 Oktober 2026<\/strong>/g, `tanggal <strong>${residuDateIndo}</strong>`);
  html = html.replace(/data tersimpan 26 Oktober 2026/g, `data tersimpan ${residuDateIndo}`);
  html = html.replace(/VervalPD · 26\/10\/2026/g, `VervalPD · ${residuSlash}`);

  // D. Injeksi overlay runtime ringan untuk elemen dinamis di county.js & revision.js
  const runtimePatch = `<script>
(function(){
  const snap = window.MONITOR_SNAPSHOT || {};
  const ikdCount = Object.values(snap.schools || {}).filter(s => Monitor.authority(s, snap.master) === 'kab').length;
  const dqmCount = S.filter(s => Monitor.authority(s, snap.master) === 'kab').length;
  const cov = document.getElementById('county-coverage');
  if (cov) {
    cov.innerHTML = [
      ['IKD sekolah', fmt(ikdCount), '${ikdDateIndo}'],
      ['DQM sekolah', fmt(dqmCount), '${dqmDateIndo}'],
      ['Rerata DQM', dec(Monitor.mean(S.filter(s => Monitor.authority(s, snap.master) === 'kab'), 'score'), 2), 'Skala 0–100'],
      ['Sekolah dengan indikator DQM gagal', fmt(S.filter(s => Monitor.authority(s, snap.master) === 'kab' && s.fail > 0).length), 'Sedikitnya satu indikator gagal']
    ].map(([l, v, n]) => '<article><span>' + l + '</span><strong>' + v + '</strong><small>' + n + '</small></article>').join('');
  }
  const srcCards = document.getElementById('source-cards');
  if (srcCards) {
    const masterKab = Object.values(snap.master || {}).filter(s => Monitor.authority(s, snap.master) === 'kab').length;
    const cards = [
      ['IKD resmi', fmt(ikdCount), 'sekolah kab · ${ikdDateIndo}', 'https://dapo.kemendikdasmen.go.id/ikd/Prov.%20Jawa%20Tengah'],
      ['DQM', fmt(dqmCount), 'sekolah kab · ${dqmDateIndo}', 'https://kualitas.data.kemendikdasmen.go.id'],
      ['Master sekolah', fmt(Object.keys(snap.master || {}).length), fmt(masterKab) + ' binaan kab · ${masterDateIndo}', 'https://referensi.data.kemendikdasmen.go.id'],
      ['Residu PD', fmt(snap.residu?.schoolRows || 0), 'sekolah · ${residuDateIndo}', 'https://vervalpd.data.kemendikdasmen.go.id'],
      ['ATS', fmt(snap.ats?.total || 0), 'catatan · ${atsDateIndo}', 'https://ats.data.kemendikdasmen.go.id']
    ];
    srcCards.innerHTML = cards.map(([l, n, note, url]) => '<div class="card"><h3>' + l + '</h3><div class="kpi accent">' + n + '</div><p>' + note + '</p><a class="small" target="_blank" rel="noopener noreferrer" href="' + url + '">Buka sumber ↗</a></div>').join('');
  }
  const insight = document.getElementById('county-level-insight');
  if (insight) insight.textContent = insight.textContent.replace('26 Oktober 2026', '${ikdDateIndo}');
  const rankCount = document.getElementById('rank-count-kab');
  if (rankCount) rankCount.textContent = rankCount.textContent.replace('26 Oktober 2026', '${ikdDateIndo}');
})();
</script>`;

  if (html.includes("</body>")) {
    html = html.replace("</body>", `${runtimePatch}\n</body>`);
  } else {
    html += runtimePatch;
  }

  return html;
}

function applyAllLiveToDist(rootDir, distDir) {
  const live = {
    ikd: readJsonIfExists(path.join(rootDir, "data/ikd-wonogiri-live.json")),
    ikdDetail: readJsonIfExists(path.join(rootDir, "data/ikd-detail-live.json")),
    master: readJsonIfExists(path.join(rootDir, "data/master-sekolah-live.json")),
    dqm: readJsonIfExists(path.join(rootDir, "data/dqm-live.json")),
    catalog: readJsonIfExists(path.join(rootDir, "data/dqm-catalog-live.json")),
    residu: readJsonIfExists(path.join(rootDir, "data/residu-live.json")),
    ats: readJsonIfExists(path.join(rootDir, "data/ats-live.json"))
  };

  const monPath = path.join(distDir, "data/monitoring.js");
  let updatedMonJs = buildLiveMonitoring(fs.readFileSync(monPath, "utf8"), live);
  if (live.ikdDetail && live.ikdDetail.details) {
    updatedMonJs += "\nwindow.MONITOR_SNAPSHOT.ikdDetails = " + JSON.stringify(live.ikdDetail.details) + ";\n";
  }
  fs.writeFileSync(monPath, updatedMonJs, "utf8");

  const ctx = { window: {} };
  vm.runInNewContext(updatedMonJs, ctx);
  const snap = ctx.window.MONITOR_SNAPSHOT;

  const htmlPath = path.join(distDir, "index.html");
  const updatedHtml = applyAllLiveToHtml(fs.readFileSync(htmlPath, "utf8"), live, snap);
  fs.writeFileSync(htmlPath, updatedHtml, "utf8");

  console.log(
    `All live snapshots applied -> IKD: ${snap.official.score}% (Rank #${snap.official.rank}/${snap.official.totalRegions}), Sekolah IKD: ${Object.keys(snap.schools).length}, DQM: ${live.dqm?.records?.length || 0}, Residu: ${snap.residu.schoolRows}, ATS: ${snap.ats.total}`
  );
}

module.exports = { applyAllLiveToDist, buildLiveMonitoring, applyAllLiveToHtml };
