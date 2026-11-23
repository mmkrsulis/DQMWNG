#!/usr/bin/env node
/**
 * Sinkronisasi Katalog Metrik DQM (Data Quality Management) Kabupaten Wonogiri
 * Sumber API resmi teridentifikasi dari probe katalog:
 *   https://qc.data.kemendikdasmen.go.id/portal-dqm/api/v1/metric/catalog
 *
 * Fitur:
 * - Zero external dependencies (Node.js 22+)
 * - Menangani pagination (page & limit) sampai seluruh metrik terambil
 * - Mendukung filter wilayah (kode_provinsi=030000, kode_kabupaten=031200) + fallback tanpa filter wilayah bila API mengembalikan kosong/global
 * - Normalisasi field metrik dan deduplikasi ID/slug metrik
 * - Validasi & fail-safe: tidak menimpa data/dqm-catalog-live.json jika respons gagal atau kosong
 */

import fs from "node:fs";
import path from "node:path";

const BASE_CATALOG_URL = "https://qc.data.kemendikdasmen.go.id/portal-dqm/api/v1/metric/catalog";
const KODE_PROVINSI = process.env.DQM_KODE_PROVINSI || "030000";
const KODE_KABUPATEN = process.env.DQM_KODE_KABUPATEN || "031200";
const PAGE_LIMIT = Number(process.env.DQM_CATALOG_LIMIT || 50);
const MAX_PAGES = 50;
const TIMEOUT_MS = 30000;

const OUT_LIVE = path.resolve("data/dqm-catalog-live.json");
const OUT_HISTORY_DIR = path.resolve("data/history/dqm-catalog");

function getWibTimestamp(date = new Date()) {
  return (
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
      .format(date)
      .replace(" ", "T") + "+07:00"
  );
}

async function fetchJsonWithRetry(url, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "DQMWNG-DQM-Catalog-Sync/1.0 (+https://github.com/mmkrsulis/DQMWNG)",
          "Accept": "application/json, text/plain, */*",
          "Referer": "https://kualitas.data.kemendikdasmen.go.id/"
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "follow"
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} dari ${url} (body: ${text.slice(0, 200)})`);
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Respons bukan JSON valid dari ${url}: ${text.slice(0, 200)}`);
      }
      return json;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
      }
    }
  }
  throw lastErr;
}

function extractItemsArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const candidates = [
    payload.data?.items,
    payload.data?.rows,
    payload.data?.list,
    payload.data?.metrics,
    payload.data?.catalog,
    Array.isArray(payload.data) ? payload.data : null,
    payload.items,
    payload.rows,
    payload.metrics,
    payload.catalog
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

function extractTotalCount(payload, currentLength) {
  const total =
    payload?.meta?.total ??
    payload?.pagination?.total ??
    payload?.data?.total ??
    payload?.data?.total_items ??
    payload?.total ??
    null;
  return Number.isFinite(Number(total)) ? Number(total) : null;
}

function normalizeMetric(raw, index) {
  if (!raw || typeof raw !== "object") return null;

  const id = String(
    raw.id ??
      raw.metric_id ??
      raw.kode_metrik ??
      raw.slug ??
      raw.kode ??
      `metric-${index + 1}`
  ).trim();

  const slug = String(raw.slug ?? raw.kode_metrik ?? raw.code ?? "").trim() || null;
  const judul = String(
    raw.judul ?? raw.nama_metrik ?? raw.nama ?? raw.title ?? raw.name ?? ""
  ).trim();

  const dimensi = String(raw.dimensi ?? raw.dimension ?? raw.kategori_dimensi ?? "").trim() || null;
  const entitas = String(raw.entitas ?? raw.entity ?? raw.sasaran ?? "").trim() || null;
  const useCase = String(raw.use_case ?? raw.useCase ?? raw.kelompok ?? "").trim() || null;
  const deskripsi = String(raw.deskripsi ?? raw.description ?? raw.aturan ?? "").trim() || null;
  const capaian = raw.capaian ?? raw.nilai ?? raw.persentase ?? raw.score ?? null;
  const predikat = String(raw.predikat ?? raw.status_label ?? raw.kategori ?? "").trim() || null;

  return {
    id,
    slug,
    judul,
    dimensi,
    entitas,
    use_case: useCase,
    deskripsi,
    capaian,
    predikat,
    detail_url: slug ? `https://kualitas.data.kemendikdasmen.go.id/metrik/${slug}` : null,
    raw
  };
}

async function fetchCatalogPages(useRegionFilter) {
  const items = [];
  let page = 1;
  let totalPagesKnown = null;
  let totalItemsKnown = null;

  while (page <= MAX_PAGES) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_LIMIT),
      sort: "judul"
    });
    if (useRegionFilter) {
      params.set("kode_provinsi", KODE_PROVINSI);
      params.set("kode_kabupaten", KODE_KABUPATEN);
    }

    const url = `${BASE_CATALOG_URL}?${params.toString()}`;
    const payload = await fetchJsonWithRetry(url);
    const pageItems = extractItemsArray(payload);

    const totalItems = extractTotalCount(payload, items.length);
    if (totalItems !== null) {
      totalItemsKnown = totalItems;
      totalPagesKnown = Math.max(1, Math.ceil(totalItems / PAGE_LIMIT));
    }

    const metaLastPage =
      payload?.meta?.last_page ??
      payload?.meta?.total_pages ??
      payload?.pagination?.total_pages ??
      payload?.data?.last_page ??
      null;
    if (Number.isFinite(Number(metaLastPage))) {
      totalPagesKnown = Math.max(totalPagesKnown ?? 1, Number(metaLastPage));
    }

    if (pageItems.length === 0) break;
    items.push(...pageItems);

    if (totalPagesKnown !== null && page >= totalPagesKnown) break;
    if (pageItems.length < PAGE_LIMIT && totalItemsKnown === null) break;

    page++;
  }

  return {
    items,
    pagesFetched: page,
    totalItemsKnown,
    totalPagesKnown
  };
}

async function main() {
  console.log("Mengambil Katalog Metrik DQM dari API resmi...");

  let fetchResult = await fetchCatalogPages(true);
  let usedRegionFilter = true;

  // Fallback jika endpoint mengembalikan kosong saat diberi parameter wilayah
  if (fetchResult.items.length === 0) {
    console.log("Respons dengan filter wilayah kosong; mencoba ambil katalog tanpa filter wilayah...");
    fetchResult = await fetchCatalogPages(false);
    usedRegionFilter = false;
  }

  const seenIds = new Set();
  const metrics = [];
  let duplicates = 0;

  for (let i = 0; i < fetchResult.items.length; i++) {
    const norm = normalizeMetric(fetchResult.items[i], i);
    if (!norm || !norm.judul) continue;
    const dedupKey = norm.slug || norm.id;
    if (seenIds.has(dedupKey)) {
      duplicates++;
      continue;
    }
    seenIds.add(dedupKey);
    metrics.push(norm);
  }

  if (metrics.length === 0) {
    throw new Error("Katalog metrik kosong (0 item valid). Snapshot lama tidak ditimpa.");
  }

  // Simpan versi ringkas tanpa duplikasi payload mentah berlebih jika diperlukan, tetap mempertahankan field utama
  const cleanMetrics = metrics.map(({ raw, ...rest }) => rest);

  const now = new Date();
  const output = {
    meta: {
      domain: "dqm_catalog",
      schema_version: "1.0.0",
      source_api: BASE_CATALOG_URL,
      source_portal: `https://kualitas.data.kemendikdasmen.go.id/katalog?sort=judul&kode_provinsi=${KODE_PROVINSI}&kode_kabupaten=${KODE_KABUPATEN}&view=list`,
      region_filter: {
        kode_provinsi: KODE_PROVINSI,
        kode_kabupaten: KODE_KABUPATEN,
        applied_to_query: usedRegionFilter
      },
      pagination: {
        page_size: PAGE_LIMIT,
        pages_fetched: fetchResult.pagesFetched,
        total_items_reported: fetchResult.totalItemsKnown,
        total_pages_reported: fetchResult.totalPagesKnown
      },
      fetched_at_utc: now.toISOString(),
      fetched_at_wib: getWibTimestamp(now),
      record_count: cleanMetrics.length,
      validation: {
        duplicates_skipped: duplicates
      }
    },
    metrics: cleanMetrics
  };

  fs.mkdirSync(path.dirname(OUT_LIVE), { recursive: true });
  fs.writeFileSync(OUT_LIVE, JSON.stringify(output, null, 2) + "\n");

  const dateWib = getWibTimestamp(now).slice(0, 10);
  fs.mkdirSync(OUT_HISTORY_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_HISTORY_DIR, `${dateWib}.json`), JSON.stringify(output, null, 2) + "\n");

  console.log(`Sukses sinkronisasi Katalog DQM: ${cleanMetrics.length} metrik (halaman dibaca: ${fetchResult.pagesFetched}).`);
  console.log(`Output tersimpan di: ${OUT_LIVE}`);
}

main().catch((err) => {
  console.error(`DQM CATALOG SYNC FAILED: ${err.message}`);
  process.exitCode = 1;
});
