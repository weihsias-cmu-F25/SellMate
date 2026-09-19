import "./loadEnv.js";
import cors from "cors";
import express from "express";
import { identifyFromImage, mapToAppCategory } from "./identify.js";
import { generatePlatformDrafts } from "./listing.js";
import {
  mockClose,
  mockPublish,
  mockUpdatePrice,
  type PlatformId,
} from "./marketplaces.js";
import { envDebug } from "./loadEnv.js";
import { hasOpenAI, normalizeOpenAIKey } from "./openai.js";
import { buildQuestionPlanLLM } from "./questions.js";
import { recommendPrice, searchComparables } from "./research.js";
import type { IdentifiedItem, SellSpeed } from "./types.js";

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "12mb" }));

app.get("/api/health", (_req, res) => {
  const raw = process.env.OPENAI_API_KEY || "";
  const normalized = normalizeOpenAIKey(raw);
  res.json({
    ok: true,
    openai: hasOpenAI(),
    keyLooksValid: Boolean(normalized?.startsWith("sk-")),
    keyHadPrefixJunk: Boolean(raw && normalized && raw !== normalized),
    keyLength: normalized?.length || 0,
    envRoot: envDebug.root,
    loadedLocalKeys: envDebug.loadedLocalKeys,
    localError: envDebug.localError || null,
    service: "sellmate-agent",
    version: 2,
  });
});

app.post("/api/identify", async (req, res) => {
  try {
    const imageDataUrl = String(req.body.imageDataUrl || "");
    if (!imageDataUrl.startsWith("data:image/")) {
      return res.status(400).json({ error: "imageDataUrl required" });
    }
    const identified = await identifyFromImage(imageDataUrl);
    const category =
      identified.prefill.category ||
      mapToAppCategory(
        [identified.category, identified.subcategory, identified.name].join(
          " ",
        ),
      );
    const prefill = { ...identified.prefill, category };
    const withCategory = {
      ...identified,
      category,
      brand: prefill.brand || identified.brand,
      model: prefill.model || identified.model,
    };
    const questionPlan = await buildQuestionPlanLLM(withCategory, {
      // Identity is already shown — only skip re-asking brand/model/category.
      brand: prefill.brand || withCategory.brand,
      model: prefill.model || withCategory.model,
      category,
      // Do NOT pass condition/damage/etc as known so we still ask 3–5 detail questions.
    });
    res.json({
      brand: prefill.brand || identified.brand,
      model: prefill.model || identified.model,
      category,
      name: identified.name,
      confidence: identified.confidence,
      visibleCondition: identified.visibleCondition,
      notes: identified.notes,
      summary: identified.summary,
      knownFields: identified.knownFields,
      uncertainFields: identified.uncertainFields,
      prefill,
      questionPlan,
      aiEnabled: hasOpenAI(),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Identify failed",
    });
  }
});

app.post("/api/questions", async (req, res) => {
  try {
    const item = req.body.item || {};
    const identification: IdentifiedItem = {
      name:
        item.name ||
        [item.brand, item.model].filter(Boolean).join(" ") ||
        item.category ||
        "Item",
      brand: item.brand || "",
      model: item.model || "",
      category: item.category || "Other",
      confidence: 1,
    };
    const questionPlan = await buildQuestionPlanLLM(identification, {
      brand: item.brand,
      model: item.model,
      category: item.category,
      condition: item.condition,
      sellSpeed: item.sellSpeed,
      dimensions: item.dimensions,
      damage: item.damage,
      accessories: item.accessories,
      functional: item.functional,
      purchased: item.purchased,
    });
    res.json({ questionPlan, aiEnabled: hasOpenAI() });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Questions failed",
    });
  }
});

app.post("/api/research", async (req, res) => {
  try {
    const item = req.body.item || {};
    const identification: IdentifiedItem = {
      name:
        [item.brand, item.model].filter(Boolean).join(" ") ||
        item.category ||
        "Item",
      brand: item.brand || "",
      model: item.model || "",
      category: item.category || "Other",
      confidence: 1,
    };
    const sellSpeed = (item.sellSpeed || "normal") as SellSpeed;
    const extras = {
      condition: item.condition as string | undefined,
      damage: item.damage as string | undefined,
      sellSpeed: ["quick", "normal", "max"].includes(sellSpeed)
        ? sellSpeed
        : ("normal" as SellSpeed),
      dimensions: item.dimensions as string | undefined,
      location: item.location as string | undefined,
    };
    const { comparables, source, llmPrices } = await searchComparables(
      identification,
      14,
      extras,
    );
    const price = recommendPrice(
      comparables,
      extras.sellSpeed,
      [item.condition, item.damage].filter(Boolean).join(" "),
      source,
      llmPrices,
    );
    res.json({
      fast: price.fast,
      recommended: price.recommended,
      max: price.max,
      checkedAt: new Date().toISOString(),
      reason: price.reason,
      source,
      comparables: comparables.map((c, i) => ({
        id: `cmp-${i}`,
        title: c.title,
        platform: c.platform,
        type: (c.source === "live" ? "Sold" : "Asking") as "Sold" | "Asking",
        price: c.price,
        condition: c.condition,
        source: c.source,
        url: c.url,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Research failed",
    });
  }
});

app.post("/api/listings", async (req, res) => {
  try {
    const item = req.body.item || {};
    const input = {
      brand: item.brand || "",
      model: item.model || "",
      category: item.category || "",
      condition: item.condition || "Good",
      damage: item.damage,
      accessories: item.accessories,
      functional: item.functional,
      purchased: item.purchased,
      dimensions: item.dimensions,
      price: Number(item.price) || 0,
      location: item.location,
      delivery: item.delivery,
    };
    const drafts = await generatePlatformDrafts(input);
    res.json({
      drafts,
      draft: drafts.offerup,
      aiEnabled: hasOpenAI(),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Listing failed",
    });
  }
});

app.post("/api/publish", async (req, res) => {
  try {
    const platform = req.body.platform as PlatformId;
    const item = req.body.item || {};
    if (!platform) {
      return res.status(400).json({ error: "platform required" });
    }
    if (process.env.DEMO_FAIL_PUBLISH === "true") {
      return res.status(502).json({
        error: `${platform} could not be reached in this demo.`,
      });
    }
    const failPlatforms = (process.env.DEMO_FAIL_PLATFORMS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (failPlatforms.includes(platform)) {
      return res.status(502).json({
        error: `${platform} could not be reached in this demo.`,
      });
    }
    const title =
      item.listings?.[platform]?.title ||
      [item.brand, item.model].filter(Boolean).join(" ") ||
      "Listing";
    const result = await mockPublish(platform, title);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Publish failed",
    });
  }
});

app.post("/api/update-price", async (req, res) => {
  try {
    const price = Number(req.body.price);
    if (!Number.isFinite(price) || price < 1) {
      return res.status(400).json({ error: "Choose a valid price." });
    }
    await mockUpdatePrice("ebay", price);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Update failed",
    });
  }
});

app.post("/api/close-listing", async (req, res) => {
  try {
    const platform = (req.body.platform || "ebay") as PlatformId;
    await mockClose(platform);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Close failed",
    });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  const raw = process.env.OPENAI_API_KEY || "";
  const normalized = normalizeOpenAIKey(raw);
  console.log(
    `SellMate agent API on http://127.0.0.1:${PORT} (OpenAI: ${hasOpenAI() ? "on" : "off — demo fallback"})`,
  );
  if (raw && normalized && raw !== normalized) {
    console.warn(
      "[env] OPENAI_API_KEY had extra text before sk-…; stripped automatically. Prefer a key that starts with sk-",
    );
  }
});
