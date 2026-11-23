#!/usr/bin/env node
/**
 * Read-only diagnostic for the public DQM metric catalogue.
 * Detects SSR vs SPA shells, embedded JSON states, API endpoints, and pagination hints.
 * Does not modify production snapshots or the existing DQM school collector.
 */
import fs from "node:fs";
import path from "node:path";

const TARGET_URL = "https://kualitas.data.kemendikdasmen.go.id/katalog?sort=judul&kode_provinsi=030000&kode_kabupaten=031200&view=list";
const OUT_DIR = path.resolve("artifacts/dqm-catalog-probe");
const TIMEOUT_MS = 45000;

function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
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

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const response = await fetch(TARGET_URL, {
    headers: {
      "User-Agent": "DQMWNG-public-monitor/1.1 (+https://github.com/mmkrsulis/DQMWNG)",
      "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7"
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow"
  });

  const body = await response.text();
  fs.writeFileSync(path.join(OUT_DIR, "catalog.html"), body);

  const responseHeaders = Object.fromEntries(response.headers.entries());
  const title = stripTags(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");

  const hasNextData = /<script[^>]*id=["']__NEXT_DATA__["']/i.test(body);
  const hasNuxtData = /window\.__NUXT__/i.test(body);
  const hasInertiaDataPage = /data-page=["'][^"']+["']/i.test(body);
  const csrfToken = body.match(/<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? null;
  const tableCount = (body.match(/<table\b/gi) ?? []).length;
  const scriptTagCount = (body.match(/<script\b/gi) ?? []).length;

  const scripts = [];
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  let scriptIndex = 0;

  while ((m = scriptRe.exec(body))) {
    const attrs = m[1] ?? "";
    const content = m[2] ?? "";
    const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1] ?? "";
    const type = attrs.match(/\btype=["']([^"']+)["']/i)?.[1] ?? "";
    const src = attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1] ?? "";

    if (content.trim()) {
      const filename = `script-${String(++scriptIndex).padStart(3, "0")}.txt`;
      fs.writeFileSync(path.join(OUT_DIR, filename), content);
      scripts.push({
        filename,
        id,
        type,
        length: content.length,
        looksJson: /^\s*[\[{]/.test(content),
        hasMetricWords: /metrik|indikator|judul|kualitas|sekolah|kabupaten|031200/i.test(content)
      });
    } else if (src) {
      scripts.push({ id, type, src });
    }
  }

  if (hasInertiaDataPage) {
    const dataPageRaw = body.match(/data-page=["']([^"']+)["']/i)?.[1];
    if (dataPageRaw) {
      fs.writeFileSync(path.join(OUT_DIR, "inertia-data-page.json"), decodeEntities(dataPageRaw));
    }
  }

  const links = [];
  const linkRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  while ((m = linkRe.exec(body))) {
    const href = m[1].match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const label = stripTags(m[2]);
    links.push({ href: decodeEntities(href), label: label.slice(0, 300) });
  }

  const apiCandidates = new Set();
  for (const match of body.matchAll(/(?:https?:)?\\?\/\\?\/[^"'\\\s<>]+|["']([^"']*(?:api|ajax|katalog|metrik|indikator|wilayah)[^"']*)["']/gi)) {
    const value = match[1] ?? match[0];
    if (/api|ajax|katalog|metrik|indikator|wilayah/i.test(value)) {
      apiCandidates.add(decodeEntities(value));
    }
  }

  const paginationHints = [
    ...new Set(
      (body.match(/(?:page|paginate|pagination|per_page|perPage|total_pages|last_page|current_page|limit|offset)[^<>"']{0,100}/gi) ?? [])
        .map((x) => stripTags(x).slice(0, 180))
    )
  ].slice(0, 200);

  const plainText = stripTags(body);

  const report = {
    requestedUrl: TARGET_URL,
    finalUrl: response.url,
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type"),
    hasSetCookie: Boolean(response.headers.get("set-cookie")),
    hasCsrfToken: Boolean(csrfToken),
    retrievedAtUtc: new Date().toISOString(),
    htmlBytes: Buffer.byteLength(body),
    title,
    architectureHints: {
      hasNextData,
      hasNuxtData,
      hasInertiaDataPage,
      tableCount,
      scriptTagCount,
      likelySpaShell: plainText.length < 1500 && scriptTagCount > 3 && tableCount === 0
    },
    pageTextPreview: plainText.slice(0, 12000),
    links: links.slice(0, 1000),
    scripts,
    apiCandidates: [...apiCandidates].slice(0, 500),
    paginationHints,
    responseHeaders,
    note: "Probe read-only. Evaluates SSR vs SPA structure before writing production crawler."
  };

  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2) + "\n");

  console.log(`HTTP ${response.status} | Bytes: ${report.htmlBytes} | Title: ${report.title}`);
  console.log(`Architecture: Next=${hasNextData}, Nuxt=${hasNuxtData}, Inertia=${hasInertiaDataPage}, Tables=${tableCount}, LikelySPA=${report.architectureHints.likelySpaShell}`);
  console.log(`Links=${links.length} | Scripts=${scripts.length} | API Candidates=${apiCandidates.size}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} diterima dari server target.`);
  }
  if (body.length < 500) {
    throw new Error(`Respons terlalu pendek (${body.length} byte), kemungkinan diblokir WAF/bot protection.`);
  }
}

main().catch((error) => {
  console.error(`DQM CATALOG PROBE FAILED: ${error.message}`);
  process.exitCode = 1;
});
