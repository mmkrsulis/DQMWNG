#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = "https://dapo.kemendikdasmen.go.id";
const IKD_JSON = path.resolve("data/ikd-wonogiri-live.json");
const OUT_JSON = path.resolve("data/ikd-detail-live.json");
const PROFILE_DIR = path.resolve(".playwright-dapo-profile");
const LIMIT = Number(process.env.IKD_DETAIL_LIMIT || 0);
const DELAY_MS = Number(process.env.IKD_DETAIL_DELAY || 650);

const ENTITY_MAP = {
  "bangunan": "bangunan",
  "tanah": "tanah",
  "ruang": "ruang",
  "sekolah": "sekolah",
  "peserta didik": "pd",
  "ptk": "ptk",
  "rombongan belajar": "rombel"
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

function round2(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function normalizeIkdByNpsn(raw) {
  const rows = Array.isArray(raw?.data) ? raw.data : [];
  if (!rows.length) return null;
  const out = { kelengkapan: {}, validitas: {}, mutakhir: {}, total: {} };
  for (const r of rows) {
    const key = ENTITY_MAP[String(r.entitas || "").trim().toLowerCase()];
    if (!key) continue;
    out.kelengkapan[key] = round2(r.Kelengkapan ?? r.kelengkapan);
    out.validitas[key] = round2(r.Validitas ?? r.validitas);
    out.mutakhir[key] = round2(r.Mutakhir ?? r.mutakhir);
    out.total[key] = round2(r.total);
  }
  return Object.keys(out.kelengkapan).length > 0 ? out : null;
}

async function main() {
  const ikd = JSON.parse(await fs.readFile(IKD_JSON, "utf8"));
  let schools = ikd.sekolah || [];
  if (LIMIT > 0) schools = schools.slice(0, LIMIT);

  let existing = {};
  try { existing = JSON.parse(await fs.readFile(OUT_JSON, "utf8")).details || {}; } catch {}
  const details = { ...existing };

  const pending = schools
    .map(s => String(s.npsn || "").trim().toUpperCase())
    .filter(npsn => npsn && !details[npsn]);

  console.log("Sudah tersimpan:", Object.keys(details).length, "| Sisa ditarik:", pending.length);
  if (!pending.length) {
    console.log("Semua sekolah sudah lengkap!");
    return;
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ["--disable-blink-features=AutomationControlled"]
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = context.pages()[0] || await context.newPage();
  let authHeader = null;

  page.on("response", async (res) => {
    const u = res.url();
    if (u.includes("/api/ikdByNpsn") && res.status() === 200) {
      const h = res.request().headers();
      if (h.authorization) authHeader = h.authorization;
      try {
        const code = String(new URL(u).searchParams.get("npsn") || "").trim().toUpperCase();
        const parsed = normalizeIkdByNpsn(await res.json());
        if (code && parsed) details[code] = parsed;
      } catch {}
    }
  });

  async function obtainSession(targetNpsn) {
    authHeader = null;
    // Masuk bertahap: halaman IKD kabupaten dulu agar SafeLine menganggap navigasi wajar
    try {
      await page.goto(BASE_URL + "/ikd/Prov.%20Jawa%20Tengah/Kab.%20Wonogiri", {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
      await sleep(4500);
    } catch {}

    try {
      await page.goto(BASE_URL + "/sekolah?npsn=" + encodeURIComponent(targetNpsn), {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
    } catch {}

    for (let i = 0; i < 40 && !authHeader; i++) {
      await sleep(500);
    }
    return authHeader;
  }

  await obtainSession(pending[0]);
  if (!authHeader) {
    await context.close();
    throw new Error("SafeLine WAF masih menahan akses. Tunggu 2-3 menit atau selesaikan verifikasi di jendela browser jika muncul.");
  }

  let success = 0, failed = 0;
  async function saveCheckpoint() {
    await fs.writeFile(OUT_JSON, JSON.stringify({
      synced_at: new Date().toISOString(),
      total_tercatat: Object.keys(details).length,
      details
    }, null, 2));
  }

  for (let i = 0; i < pending.length; i++) {
    const npsn = pending[i];
    if (details[npsn]) { success++; continue; }

    let parsed = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      if (!authHeader) await obtainSession(npsn);
      if (!authHeader) break;

      const res = await page.evaluate(async ({ baseUrl, code, auth }) => {
        try {
          const r = await fetch(baseUrl + "/api/ikdByNpsn?npsn=" + encodeURIComponent(code), {
            headers: {
              "authorization": auth,
              "content-type": "application/json",
              "referer": baseUrl + "/sekolah?npsn=" + encodeURIComponent(code)
            }
          });
          if (!r.ok) return { ok: false, status: r.status };
          return { ok: true, json: await r.json() };
        } catch {
          return { ok: false, status: 0 };
        }
      }, { baseUrl: BASE_URL, code: npsn, auth: authHeader });

      if (res.ok) {
        parsed = normalizeIkdByNpsn(res.json);
      } else if (res.status === 401 || res.status === 403 || res.status === 468) {
        console.log("Sesi perlu diperbarui pada NPSN", npsn, "(HTTP " + res.status + ")...");
        await sleep(3000);
        await obtainSession(npsn);
      } else {
        await sleep(2500);
      }
    }

    if (parsed) {
      details[npsn] = parsed;
      success++;
    } else {
      failed++;
    }

    await sleep(DELAY_MS);

    if ((i + 1) % 25 === 0) {
      console.log("Progress sisa:", i + 1, "/", pending.length, "| Total tersimpan:", Object.keys(details).length);
      await saveCheckpoint();
    }
  }

  await context.close();
  await saveCheckpoint();
  console.log("Selesai! Total detail 7 entitas tersimpan:", Object.keys(details).length, "sekolah.");
}

main().catch(err => { console.error(err); process.exit(1); });
