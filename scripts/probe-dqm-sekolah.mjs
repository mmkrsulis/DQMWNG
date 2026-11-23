#!/usr/bin/env node
/**
 * Read-only diagnostic untuk halaman profil sekolah Portal DQM Kemendikdasmen.
 * Mengekstrak endpoint REST API (`portal-dqm/api/v1/...`) dari bundle Angular SPA
 * pada `https://kualitas.data.kemendikdasmen.go.id/sekolah/{uuid}` dan menguji
 * respons JSON pada 1 sekolah sampel Wonogiri.
 */
import fs from "node:fs";
import path from "node:path";

const PORTAL_ORIGIN = "https://kualitas.data.kemendikdasmen.go.id";
const API_BASE = "https://qc.data.kemendikdasmen.go.id/portal-dqm/api/v1";
const OUT_DIR = path.resolve("artifacts/dqm-sekolah-probe");
const TIMEOUT_MS = 30000;

function pickSampleSchool() {
  try {
    const raw = fs.readFileSync(path.resolve("data/master-sekolah-live.json"), "utf8");
    const doc = JSON.parse(raw);
    const found = (doc.schools || []).find(
      (s) => s.npsn === "20310753" && s.uuid
    ) || (doc.schools || []).find((s) => s.is_binaan_disdik && s.uuid);
    if (found) {
      return { npsn: found.npsn, uuid: found.uuid, nama: found.nama };
    }
  } catch {
    // fallback di bawah
  }
  return {
    npsn: "20310753",
    uuid: "A03224D3-8DB3-E111-AB39-0F5E46C5744A",
    nama: "SD Negeri 3 Ngroto",
  };
}

async function fetchText(url, accept = "*/*") {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "DQMWNG-public-monitor/1.1 (+https://github.com/mmkrsulis/DQMWNG)",
      "Accept": accept,
      "Referer": `${PORTAL_ORIGIN}/`,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, url: res.url, text };
}

function extractApiRoutesFromBundle(jsText) {
  const routes = new Set();

  // 1. Pola eksplisit portal-dqm/api/v1/... atau /api/v1/...
  for (const m of jsText.matchAll(/(?:portal-dqm\/)?api\/v1\/[a-zA-Z0-9_${}.?=&/-]+/g)) {
    routes.add(m[0]);
  }

  // 2. Pola template literal atau string yang mengandung /sekolah atau /satpen
  for (const m of jsText.matchAll(/["'`]([^"'`]{1,120}(?:sekolah|satpen|school|metric|summary|rekap)[^"'`]{0,120})["'`]/gi)) {
    const val = m[1];
    if (val.includes("/") && !val.includes(" ") && !val.includes("<")) {
      routes.add(val);
    }
  }

  return [...routes].sort();
}

async function probeApiEndpoint(label, url) {
  try {
    const res = await fetchText(url, "application/json, text/plain, */*");
    let parsed = null;
    try {
      parsed = JSON.parse(res.text);
    } catch {
      // bukan JSON
    }
    return {
      label,
      url,
      status: res.status,
      ok: res.ok,
      isJson: parsed !== null,
      preview: parsed
        ? JSON.stringify(parsed).slice(0, 600)
        : res.text.replace(/\s+/g, " ").slice(0, 300),
    };
  } catch (err) {
    return {
      label,
      url,
      status: 0,
      ok: false,
      isJson: false,
      error: err.message,
    };
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const sample = pickSampleSchool();
  const pageUrl = `${PORTAL_ORIGIN}/sekolah/${encodeURIComponent(sample.uuid)}`;

  console.log(`1. Mengambil shell HTML: ${pageUrl} (${sample.npsn} - ${sample.nama})`);
  const htmlRes = await fetchText(pageUrl, "text/html,application/xhtml+xml");
  fs.writeFileSync(path.join(OUT_DIR, "sekolah.html"), htmlRes.text);

  const ngStateMatch = htmlRes.text.match(/<script[^>]*id=["']ng-state["'][^>]*>([\s\S]*?)<\/script>/i);
  const hasNgState = Boolean(ngStateMatch && ngStateMatch[1].trim().length > 5);
  console.log(`   HTTP ${htmlRes.status} | Bytes: ${htmlRes.text.length} | Has ng-state: ${hasNgState}`);

  // Ekstrak file JS Angular (<script src="...">)
  const scriptSrcs = [];
  for (const m of htmlRes.text.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    scriptSrcs.push(m[1]);
  }
  console.log(`2. Script bundles ditemukan: ${scriptSrcs.join(", ")}`);

  const discoveredRoutes = new Set();
  if (hasNgState) {
    for (const r of extractApiRoutesFromBundle(ngStateMatch[1])) {
      discoveredRoutes.add(r);
    }
  }

  for (const src of scriptSrcs) {
    if (/polyfills/i.test(src)) continue;
    const jsUrl = src.startsWith("http") ? src : `${PORTAL_ORIGIN}/${src.replace(/^\/+/, "")}`;
    console.log(`   Mengunduh bundle: ${jsUrl}`);
    const jsRes = await fetchText(jsUrl, "application/javascript,*/*");
    if (jsRes.ok) {
      const routes = extractApiRoutesFromBundle(jsRes.text);
      routes.forEach((r) => discoveredRoutes.add(r));
    }
  }

  const routeList = [...discoveredRoutes];
  console.log(`3. Kandidat route/endpoint dari bundle (${routeList.length}):`);
  for (const r of routeList) {
    console.log(`   - ${r}`);
  }

  // Uji endpoint REST API kandidat pada qc.data.kemendikdasmen.go.id
  const uuidLower = sample.uuid.toLowerCase();
  const uuidUpper = sample.uuid.toUpperCase();
  const candidates = [
    ["sekolah_by_uuid_upper", `${API_BASE}/sekolah/${uuidUpper}`],
    ["sekolah_by_uuid_lower", `${API_BASE}/sekolah/${uuidLower}`],
    ["sekolah_detail_uuid", `${API_BASE}/sekolah/detail/${uuidLower}`],
    ["sekolah_summary_uuid", `${API_BASE}/sekolah/summary/${uuidLower}`],
    ["sekolah_metrics_uuid", `${API_BASE}/sekolah/${uuidLower}/metrics`],
    ["sekolah_metric_uuid", `${API_BASE}/sekolah/${uuidLower}/metric`],
    ["sekolah_by_npsn", `${API_BASE}/sekolah/${sample.npsn}`],
    ["sekolah_list_kab", `${API_BASE}/sekolah?kode_provinsi=030000&kode_kabupaten=031200&page=1&limit=5`],
    ["satpen_by_uuid", `${API_BASE}/satpen/${uuidLower}`],
    ["satpen_list_kab", `${API_BASE}/satpen?kode_provinsi=030000&kode_kabupaten=031200&page=1&limit=5`],
  ];

  console.log("4. Menguji endpoint JSON API:");
  const probeResults = [];
  for (const [label, url] of candidates) {
    const res = await probeApiEndpoint(label, url);
    probeResults.push(res);
    if (res.ok && res.isJson) {
      console.log(`   [OK JSON] ${label}: ${res.preview}`);
    } else {
      console.log(`   [${res.status}] ${label}`);
    }
  }

  const report = {
    probedAtUtc: new Date().toISOString(),
    sample,
    pageUrl,
    htmlStatus: htmlRes.status,
    hasNgState,
    scriptSrcs,
    discoveredRoutes: routeList,
    probeResults,
  };

  const reportPath = path.join(OUT_DIR, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`Laporan lengkap tersimpan di: ${reportPath}`);
}

main().catch((err) => {
  console.error(`DQM SEKOLAH PROBE FAILED: ${err.message}`);
  process.exitCode = 1;
});
