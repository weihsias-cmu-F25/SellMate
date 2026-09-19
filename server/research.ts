import { z } from "zod";
import { getOpenAI, hasOpenAI, textModel } from "./openai.js";
import { scrapeMarketComps } from "./scrape.js";
import type { ComparableListing, IdentifiedItem, SellSpeed } from "./types.js";

const CURATED: ComparableListing[] = [
  {
    title: "IKEA MICKE Desk — white, good condition",
    price: 45,
    condition: "Good",
    platform: "Facebook Marketplace",
    location: "Mountain View, CA",
    source: "curated",
  },
  {
    title: "IKEA MICKE Desk with drawer",
    price: 40,
    condition: "Fair",
    platform: "OfferUp",
    location: "Sunnyvale, CA",
    source: "curated",
  },
  {
    title: "IKEA MICKE Desk — like new",
    price: 60,
    condition: "Like New",
    platform: "eBay",
    location: "San Jose, CA",
    source: "curated",
  },
  {
    title: "Sony WH-1000XM5 headphones",
    price: 205,
    condition: "Excellent",
    platform: "eBay",
    location: "Bay Area, CA",
    source: "curated",
  },
  {
    title: "Sony WH-1000XM5 — like new with case",
    price: 229,
    condition: "Like New",
    platform: "Facebook Marketplace",
    location: "San Francisco, CA",
    source: "curated",
  },
  {
    title: "Fujifilm X-T20 body",
    price: 495,
    condition: "Good",
    platform: "eBay",
    location: "Bay Area, CA",
    source: "curated",
  },
  {
    title: "MacBook Pro 13\" M1 8/256",
    price: 550,
    condition: "Good",
    platform: "Facebook Marketplace",
    location: "Mountain View, CA",
    source: "curated",
  },
  {
    title: "Trek FX 2 hybrid bike",
    price: 280,
    condition: "Good",
    platform: "Facebook Marketplace",
    location: "Mountain View, CA",
    source: "curated",
  },
];

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function score(listing: ComparableListing, query: string): number {
  const q = tokens(query);
  if (!q.length) return 0;
  const title = new Set(tokens(listing.title));
  let hits = 0;
  for (const word of q) {
    if (title.has(word)) hits += 1;
  }
  // Require meaningful overlap (brand+model style), not a single generic word.
  return hits;
}

/** Only return curated rows that actually match this item — never dump the whole catalog. */
function curatedComps(
  identification: IdentifiedItem,
  limit = 6,
): ComparableListing[] {
  const query = [identification.brand, identification.model, identification.name]
    .filter(Boolean)
    .join(" ");
  const ranked = [...CURATED]
    .map((listing) => ({ listing, s: score(listing, query) }))
    .filter((row) => row.s >= 2)
    .sort((a, b) => b.s - a.s || a.listing.price - b.listing.price);
  return ranked.map((r) => r.listing).slice(0, limit);
}

function parsePrice(text: string): number | null {
  const cleaned = text.replace(/,/g, "");
  const match = cleaned.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
}

function buildQuery(identification: IdentifiedItem): string {
  return [identification.brand, identification.model]
    .filter(Boolean)
    .join(" ")
    .trim() || identification.name.trim();
}

/** eBay Finding API (optional). Set EBAY_APP_ID in .env.local */
export async function searchEbayFinding(
  query: string,
  limit = 8,
): Promise<ComparableListing[]> {
  const appId = process.env.EBAY_APP_ID?.trim();
  if (!appId || !query) return [];

  const params = new URLSearchParams({
    "OPERATION-NAME": "findCompletedItems",
    "SERVICE-VERSION": "1.13.0",
    "SECURITY-APPNAME": appId,
    "RESPONSE-DATA-FORMAT": "JSON",
    "REST-PAYLOAD": "true",
    keywords: query,
    "paginationInput.entriesPerPage": String(Math.min(limit, 20)),
    "itemFilter(0).name": "SoldItemsOnly",
    "itemFilter(0).value": "true",
    "sortOrder": "EndTimeSoonest",
  });

  const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      findCompletedItemsResponse?: Array<{
        searchResult?: Array<{
          item?: Array<{
            title?: string[];
            sellingStatus?: Array<{ currentPrice?: Array<{ __value__?: string }> }>;
            condition?: Array<{ conditionDisplayName?: string[] }>;
            viewItemURL?: string[];
          }>;
        }>;
      }>;
    };
    const items =
      data.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
    const out: ComparableListing[] = [];
    for (const item of items) {
      const title = item.title?.[0];
      const priceRaw =
        item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__;
      const price = priceRaw ? Number(priceRaw) : NaN;
      if (!title || !Number.isFinite(price) || price <= 0) continue;
      out.push({
        title,
        price: Math.round(price),
        condition: item.condition?.[0]?.conditionDisplayName?.[0] || "Used",
        platform: "eBay (sold)",
        location: "US",
        url: item.viewItemURL?.[0],
        source: "live",
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch (error) {
    console.warn("[research] eBay Finding API failed:", error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Public RSS often blocked (403). Kept as a best-effort attempt. */
export async function searchEbayRss(
  query: string,
  limit = 8,
): Promise<ComparableListing[]> {
  if (!query) return [];
  const url =
    "https://www.ebay.com/sch/i.html?" +
    new URLSearchParams({
      _nkw: query,
      _rss: "1",
      LH_Sold: "1",
      LH_Complete: "1",
      rt: "nc",
    }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SellMate/1.0; +https://localhost)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) {
      console.warn(`[research] eBay RSS status ${res.status}`);
      return [];
    }
    const xml = await res.text();
    if (!/<item>/i.test(xml)) return [];
    const items: ComparableListing[] = [];
    for (const block of xml.split(/<item>/i).slice(1)) {
      const title =
        block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i)?.[1] ||
        block.match(/<title>(.*?)<\/title>/i)?.[1];
      const desc =
        block.match(
          /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i,
        )?.[1] ||
        block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ||
        "";
      const link = block.match(/<link>(.*?)<\/link>/i)?.[1];
      if (!title) continue;
      const price = parsePrice(desc) || parsePrice(title);
      if (!price) continue;
      items.push({
        title: title.replace(/<!\[CDATA\[|\]\]>/g, "").trim(),
        price: Math.round(price),
        condition: /new/i.test(title) ? "New" : "Used",
        platform: "eBay",
        location: "Online / US",
        url: link?.trim(),
        source: "live",
      });
      if (items.length >= limit) break;
    }
    return items;
  } catch (error) {
    console.warn("[research] eBay RSS failed:", error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

const LlmResearchSchema = z.object({
  fast: z.number(),
  recommended: z.number(),
  max: z.number(),
  reason: z.string(),
  comparables: z
    .array(
      z.object({
        title: z.string(),
        price: z.number(),
        condition: z.string(),
        platform: z.string(),
      }),
    )
    .min(2)
    .max(6),
});

/** When live APIs are blocked, estimate used-market prices with the LLM (labeled). */
export async function estimateWithLLM(
  identification: IdentifiedItem,
  extras?: {
    condition?: string;
    damage?: string;
    sellSpeed?: SellSpeed;
    dimensions?: string;
    location?: string;
  },
): Promise<{
  comparables: ComparableListing[];
  fast: number;
  recommended: number;
  max: number;
  reason: string;
} | null> {
  if (!hasOpenAI()) return null;
  const client = getOpenAI()!;
  try {
    const response = await client.chat.completions.create({
      model: textModel(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You estimate used resale prices for Bay Area / US local pickup and online secondhand markets (eBay sold, Facebook Marketplace, OfferUp).
Return JSON:
{
  "fast": number,
  "recommended": number,
  "max": number,
  "reason": "1-2 sentences citing typical sold/asking ranges",
  "comparables": [
    { "title": string, "price": number, "condition": string, "platform": "eBay"|"Facebook Marketplace"|"OfferUp"|"Craigslist" }
  ]
}
Rules:
- Prices in USD, realistic for USED items in 2024-2026.
- comparables must match THIS exact product (brand/model), not random furniture.
- fast < recommended <= max (or fast ≈ recommended for quick sale).
- Be conservative; do not invent luxury pricing.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            item: identification,
            details: extras,
          }),
        },
      ],
    });
    const text = response.choices[0]?.message?.content?.trim() || "";
    const parsed = LlmResearchSchema.parse(JSON.parse(text));
    return {
      fast: Math.round(parsed.fast),
      recommended: Math.round(parsed.recommended),
      max: Math.round(parsed.max),
      reason: `AI market estimate (live eBay feed blocked without EBAY_APP_ID). ${parsed.reason}`,
      comparables: parsed.comparables.map((c) => ({
        ...c,
        price: Math.round(c.price),
        source: "ai_estimate" as const,
        location: extras?.location || "US used market",
      })),
    };
  } catch (error) {
    console.warn("[research] LLM estimate failed:", error);
    return null;
  }
}

export async function searchComparables(
  identification: IdentifiedItem,
  limit = 14,
  extras?: {
    condition?: string;
    damage?: string;
    sellSpeed?: SellSpeed;
    dimensions?: string;
    location?: string;
  },
): Promise<{
  comparables: ComparableListing[];
  source: "live" | "curated" | "ai_estimate" | "none";
  llmPrices?: { fast: number; recommended: number; max: number; reason: string };
}> {
  const query = buildQuery(identification);
  const target = Math.max(limit, 12);

  // 1) Live scrape: Craigslist regions + DuckDuckGo per marketplace
  const scraped = query ? await scrapeMarketComps(query, target) : [];
  const scrapedPriced = scraped.filter((c) => c.price > 0);
  if (scrapedPriced.length >= 2 || scraped.length >= 8) {
    return { comparables: scraped.slice(0, target), source: "live" };
  }

  // 2) Optional eBay Finding API
  const liveFinding = await searchEbayFinding(query, target);
  if (liveFinding.length >= 2) {
    return {
      comparables: [...scraped, ...liveFinding].slice(0, target),
      source: "live",
    };
  }

  // 3) Strict curated match only
  const curated = curatedComps(identification, target);
  if (curated.length >= 2) {
    return {
      comparables: [...scraped, ...curated].slice(0, target),
      source: scraped.length ? "live" : "curated",
    };
  }

  // 4) If we scraped some links but few prices, still return them and blend LLM
  if (scraped.length > 0) {
    const llm = await estimateWithLLM(identification, extras);
    if (llm) {
      return {
        comparables: [...scraped, ...llm.comparables].slice(0, target),
        source: "live",
        llmPrices: {
          fast: llm.fast,
          recommended: llm.recommended,
          max: llm.max,
          reason: `${llm.reason} Combined with ${scraped.length} live listing link(s) from the web.`,
        },
      };
    }
    return { comparables: scraped.slice(0, target), source: "live" };
  }

  const llm = await estimateWithLLM(identification, extras);
  if (llm) {
    return {
      comparables: llm.comparables.slice(0, target),
      source: "ai_estimate",
      llmPrices: {
        fast: llm.fast,
        recommended: llm.recommended,
        max: llm.max,
        reason: llm.reason,
      },
    };
  }

  return { comparables: [], source: "none" };
}

export function recommendPrice(
  comparables: ComparableListing[],
  sellSpeed: SellSpeed = "normal",
  conditionHint?: string,
  source: "live" | "curated" | "ai_estimate" | "none" = "none",
  llmPrices?: { fast: number; recommended: number; max: number; reason: string },
): {
  recommended: number;
  low: number;
  high: number;
  fast: number;
  max: number;
  reason: string;
} {
  if (llmPrices && source === "ai_estimate") {
    return {
      recommended: llmPrices.recommended,
      low: Math.min(llmPrices.fast, llmPrices.recommended),
      high: llmPrices.max,
      fast: llmPrices.fast,
      max: llmPrices.max,
      reason: llmPrices.reason,
    };
  }

  const prices = comparables
    .map((c) => c.price)
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (prices.length === 0) {
    return {
      recommended: 40,
      low: 30,
      high: 60,
      fast: 30,
      max: 55,
      reason:
        "No matching comps found. Add EBAY_APP_ID for live sold prices, or check brand/model.",
    };
  }

  const low = prices[0];
  const high = prices[prices.length - 1];
  const mid = prices[Math.floor(prices.length / 2)];

  let recommended = mid;
  if (sellSpeed === "quick") {
    recommended = Math.round(low + (mid - low) * 0.35);
  } else if (sellSpeed === "max") {
    recommended = Math.round(mid + (high - mid) * 0.55);
  }

  const worn = /fair|poor|scratch|damage|dent/i.test(conditionHint ?? "");
  if (worn) recommended = Math.max(low, recommended - 5);

  const likeNew = /like\s*new|excellent|mint/i.test(conditionHint ?? "");
  if (likeNew && sellSpeed !== "quick") {
    recommended = Math.min(high, recommended + 5);
  }

  const sourceNote =
    source === "live"
      ? `Used ${comparables.filter((c) => c.url || c.source === "live").length} live web listing${comparables.length === 1 ? "" : "s"} (Craigslist / OfferUp / eBay / etc.)`
      : source === "curated"
        ? `Used ${comparables.length} matched local comps`
        : "Limited comps";

  return {
    recommended,
    low,
    high,
    fast: Math.round(low + (mid - low) * 0.25),
    max: Math.round(mid + (high - mid) * 0.7),
    reason: `${sourceNote}. Similar items $${low}–$${high}. For a ${sellSpeed} sale → $${recommended}.`,
  };
}
