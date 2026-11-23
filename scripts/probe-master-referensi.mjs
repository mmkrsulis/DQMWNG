#!/usr/bin/env node
/**
 * Probe / eksplorasi sumber daftar satuan pendidikan binaan Kab. Wonogiri (PAUD, SD, SMP)
 * Contoh detail satuan pendidikan yang ditetapkan di roadmap:
 *   https://referensi.data.kemendikdasmen.go.id/satpen/detail/20311568
 */
import fs from "node:fs";
import path from "node:path";

const SAMPLE_DETAIL_URL = process.env.MASTER_SAMPLE_URL || "https://referensi.data.kemendikdasmen.go.id/satpen/detail/20311568";
const CANDIDATE_LIST_URLS = [
  "https://referensi.data.kemendikdasmen.go.id/pendidikan/paud/031200/3",
  "https://referensi.data.kemendikdasmen.go.id/pendidikan/sd/031200/3",
  "https://referensi.data.kemendikdasmen.go.id/pendidikan/smp/031200/3",
  "https://referensi.data.kemendikdasmen.go.id/index.php/Csekolah/index?kode_wilayah=031200"
];

const OUT_DIR = path.resolve("artifacts/master-sekolah-probe");
const TIMEOUT_MS = 35000;

function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(s) {
  return decodeEntities(
    String(s)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}

async function checkUrl(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "DQMWNG-Master-Probe/1.0 (+https://github.com/mmkrsulis/DQMWNG)",
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow"
    });
    const body = await res.text();
    const npsnMatches = [...new Set((body.match(/\b[1-9]\d{7}\b/g) ?? []))];
    const tableRows = (body.match(/<tr\b/gi) ?? []).length;
    const links = [...body.matchAll(/href=["']([^"']+)["']/gi)].map((m) => decodeEntities(m[1]));

    return {
      url,
      finalUrl: res.url,
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get("content-type"),
      bytes: Buffer.byteLength(body),
      title: stripTags(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""),
      tableRows,
      distinct8DigitNumbers: npsnMatches.length,
      sampleNumbers: npsnMatches.slice(0, 20),
      interestingLinks: [...new Set(links.filter((l) => /031200|satpen|detail|pendidikan|paud|sd|smp|api|json/i.test(l)))].slice(0, 50),
      textPreview: stripTags(body).slice(0, 1500)
    };
  } catch (err) {
    return {
      url,
      ok: false,
      error: err.message
    };
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = [];

  for (const url of [SAMPLE_DETAIL_URL, ...CANDIDATE_LIST_URLS]) {
    console.log(`Memeriksa: ${url}`);
    const info = await checkUrl(url);
    results.push(info);
    console.log(`  -> status=${info.status ?? "ERR"} ok=${info.ok} bytes=${info.bytes ?? 0} rows=${info.tableRows ?? 0} nums=${info.distinct8DigitNumbers ?? 0}`);
  }

  const report = {
    probedAtUtc: new Date().toISOString(),
    results
  };

  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Laporan tersimpan di: ${path.join(OUT_DIR, "report.json")}`);
}

main().catch((err) => {
  console.error(`MASTER PROBE FAILED: ${err.message}`);
  process.exitCode = 1;
});
