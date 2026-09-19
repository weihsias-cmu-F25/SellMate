import type { ComparableListing } from "./types.js";

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

const CL_REGIONS = [
  "sfbay",
  "sacramento",
  "fresno",
  "stockton",
  "reno",
  "losangeles",
  "sandiego",
  "portland",
  "seattle",
  "phoenix",
  "denver",
  "orangecounty",
] as const;

function parsePrice(text: string): number | null {
  const cleaned = text.replace(/,/g, "");
  const match = cleaned.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 && n < 100000 ? Math.round(n) : null;
}

function decodeDuckLink(href: string): string | null {
  try {
    const abs = href.startsWith("//") ? `https:${href}` : href;
    const url = new URL(abs, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : abs;
  } catch {
    return null;
  }
}

function platformFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("ebay.")) return "eBay";
    if (host.includes("offerup.")) return "OfferUp";
    if (host.includes("craigslist.")) return "Craigslist";
    if (host.includes("facebook.") || host.includes("fb."))
      return "Facebook Marketplace";
    if (host.includes("mercari.")) return "Mercari";
    return host;
  } catch {
    return "Web";
  }
}

async function fetchText(url: string, timeoutMs = 10000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: UA, signal: controller.signal });
    if (!res.ok) {
      console.warn(`[scrape] ${url} → ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (error) {
    console.warn(`[scrape] failed ${url}:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseCraigslistHtml(
  html: string,
  locationLabel: string,
  limit: number,
): ComparableListing[] {
  const out: ComparableListing[] = [];
  const blocks = [
    ...html.matchAll(
      /<li class="cl-static-search-result"[^>]*title="([^"]*)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<div class="price">([^<]*)<\/div>/gi,
    ),
  ];
  for (const match of blocks) {
    const title = match[1]?.trim();
    const link = match[2]?.trim();
    const price = parsePrice(match[3] || "");
    if (!title || !link || !price) continue;
    out.push({
      title,
      price,
      condition: "Used",
      platform: "Craigslist",
      location: locationLabel,
      url: link,
      source: "live",
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Multiple Bay Area / NorCal Craigslist regions. */
export async function scrapeCraigslist(
  query: string,
  limit = 12,
): Promise<ComparableListing[]> {
  if (!query.trim()) return [];
  const perRegion = Math.max(6, Math.ceil(limit / 2));
  const results = await Promise.all(
    CL_REGIONS.map(async (region) => {
      const url =
        `https://${region}.craigslist.org/search/sss?` +
        new URLSearchParams({ query, sort: "date" }).toString();
      const html = await fetchText(url);
      if (!html) return [] as ComparableListing[];
      return parseCraigslistHtml(html, `${region} Craigslist`, perRegion);
    }),
  );

  const merged: ComparableListing[] = [];
  const seen = new Set<string>();
  for (const item of results.flat()) {
    const key = (item.url || item.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
}

async function scrapeDuckQuery(
  q: string,
  limit: number,
): Promise<ComparableListing[]> {
  const url =
    "https://html.duckduckgo.com/html/?" +
    new URLSearchParams({ q }).toString();
  const html = await fetchText(url);
  if (!html) return [];

  const out: ComparableListing[] = [];
  const blocks = [
    ...html.matchAll(
      /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/gi,
    ),
  ];

  for (const match of blocks) {
    const link = decodeDuckLink(match[1] || "");
    const title = (match[2] || "").replace(/<[^>]+>/g, "").trim();
    const snippet = (match[3] || "").replace(/<[^>]+>/g, "").trim();
    if (!link || !title) continue;
    if (
      !/ebay\.|offerup\.|craigslist\.|mercari\.|facebook\.|fb\./i.test(link)
    )
      continue;

    const price = parsePrice(title) || parsePrice(snippet);
    out.push({
      title,
      price: price ?? 0,
      condition: /new/i.test(title) ? "New" : "Used",
      platform: platformFromUrl(link),
      location: "Online / local",
      url: link,
      source: "live",
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * DuckDuckGo HTML search — one query per marketplace for more results.
 */
export async function scrapeDuckDuckGoMarketplaces(
  query: string,
  limit = 12,
): Promise<ComparableListing[]> {
  if (!query.trim()) return [];
  const sites = [
    "site:ebay.com",
    "site:offerup.com",
    "site:craigslist.org",
    "site:mercari.com",
    "site:facebook.com/marketplace",
  ];
  const perSite = Math.max(3, Math.ceil(limit / sites.length) + 1);
  const batches = await Promise.all(
    sites.map((site) => scrapeDuckQuery(`${query} ${site}`, perSite)),
  );

  const merged: ComparableListing[] = [];
  const seen = new Set<string>();
  for (const item of batches.flat()) {
    const key = (item.url || item.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
}

export async function scrapeMarketComps(
  query: string,
  limit = 14,
): Promise<ComparableListing[]> {
  const target = Math.max(limit, 14);
  const altQuery = query.replace(/\s+/g, " ").trim();
  const shortQuery = altQuery.split(/\s+/).slice(0, 3).join(" ");
  const keywordQuery = altQuery.split(/\s+/).slice(0, 2).join(" ");

  const [craigslist, craigslistShort, duck, duckEbay, duckOffer, duckFb] =
    await Promise.all([
      scrapeCraigslist(altQuery, Math.ceil(target * 0.8)),
      shortQuery !== altQuery
        ? scrapeCraigslist(shortQuery, 8)
        : Promise.resolve([] as ComparableListing[]),
      scrapeDuckDuckGoMarketplaces(altQuery, target),
      scrapeDuckQuery(`${altQuery} for sale site:ebay.com`, 8),
      scrapeDuckQuery(`${keywordQuery} for sale site:offerup.com`, 6),
      scrapeDuckQuery(`${keywordQuery} site:facebook.com/marketplace`, 6),
    ]);

  const merged: ComparableListing[] = [];
  const seen = new Set<string>();
  const ordered = [
    ...craigslist.filter((c) => c.price > 0),
    ...craigslistShort.filter((c) => c.price > 0),
    ...duck.filter((c) => c.price > 0),
    ...duckEbay.filter((c) => c.price > 0),
    ...duckOffer.filter((c) => c.price > 0),
    ...duckFb.filter((c) => c.price > 0),
    ...duck.filter((c) => c.price <= 0),
    ...duckEbay.filter((c) => c.price <= 0),
    ...duckOffer.filter((c) => c.price <= 0),
    ...duckFb.filter((c) => c.price <= 0),
  ];
  for (const item of ordered) {
    const key = (item.url || item.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= target) break;
  }
  return merged;
}
