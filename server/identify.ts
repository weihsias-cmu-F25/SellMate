import { z } from "zod";
import { getOpenAI, hasOpenAI, visionModel } from "./openai.js";
import type { IdentifiedItem, IdentifyPrefill } from "./types.js";

const IdentificationSchema = z.object({
  name: z.string(),
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  category: z.string(),
  subcategory: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  visibleCondition: z.string().nullable().optional(),
  conditionLabel: z
    .enum(["Excellent", "Good", "Fair", "Poor"])
    .nullable()
    .optional(),
  damageVisible: z.string().nullable().optional(),
  accessoriesVisible: z.string().nullable().optional(),
  dimensionsGuess: z.string().nullable().optional(),
  knownFields: z.array(z.string()).optional(),
  uncertainFields: z.array(z.string()).optional(),
  summary: z.string().optional(),
  notes: z.string().nullable().optional(),
});

function mockIdentify(): IdentifiedItem & { prefill: IdentifyPrefill } {
  return {
    name: "IKEA MICKE Desk",
    brand: "IKEA",
    model: "MICKE",
    category: "Furniture",
    subcategory: "Desk",
    confidence: 0.92,
    visibleCondition: "Appears used, generally clean",
    knownFields: ["brand", "model", "category", "condition"],
    uncertainFields: ["dimensions", "damage", "sellSpeed"],
    summary: "Looks like an IKEA MICKE desk in good used condition.",
    notes: "Demo fallback — OpenAI unavailable.",
    prefill: {
      brand: "IKEA",
      model: "MICKE",
      category: "Home & living",
      condition: "Good",
    },
  };
}

export function mapToAppCategory(raw: string): string {
  const h = raw.toLowerCase();
  if (/headphone|earbud|airpod|headset/.test(h)) return "Headphones";
  if (/camera|lens|fujifilm|canon|nikon|sony a/.test(h)) return "Cameras";
  if (
    /furniture|desk|chair|lamp|table|fridge|microwave|home|sofa|shelf|stool/.test(
      h,
    )
  )
    return "Home & living";
  return "Other";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type IdentifyResult = IdentifiedItem & { prefill: IdentifyPrefill };

export async function identifyFromImage(
  imageDataUrl: string,
): Promise<IdentifyResult> {
  if (!hasOpenAI()) return mockIdentify();

  const client = getOpenAI()!;
  try {
    const response = await client.chat.completions.create({
      model: visionModel(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are the vision step of a local resale agent (Bay Area moving sale).

Look at the photo and extract what you can. Be honest about uncertainty.

Return JSON only:
{
  "name": "human label, e.g. IKEA MICKE Desk or White office desk",
  "brand": string or null if not readable/confident,
  "model": string or null if not readable/confident,
  "category": broad type (Furniture, Electronics, Headphones, Cameras, Bicycle, Appliance, Other…),
  "subcategory": string or null,
  "confidence": 0-1 overall ID confidence,
  "visibleCondition": short visual note or null,
  "conditionLabel": "Excellent"|"Good"|"Fair"|"Poor"|null (only if you can judge from the photo),
  "damageVisible": string or null (only if damage is visible),
  "accessoriesVisible": string or null,
  "dimensionsGuess": string or null (only if you can roughly estimate),
  "knownFields": string[] fields you are confident about (subset of brand,model,category,condition,damage,accessories,dimensions),
  "uncertainFields": string[] fields a seller should confirm (subset of brand,model,category,condition,functional,damage,accessories,dimensions,purchased,sellSpeed),
  "summary": one sentence for the user, e.g. "This looks like a white IKEA MICKE desk in good used condition.",
  "notes": optional caveats
}

Rules:
- Prefer a useful "name" even if brand/model are null ("office chair", "mini fridge").
- Do NOT invent a specific model if you cannot see it.
- Put only high-confidence facts in knownFields.
- uncertainFields should be the gaps that matter for pricing/listing (usually 1–5 items).
- Always include "sellSpeed" in uncertainFields unless the photo somehow indicates urgency (it won't).
- If overall confidence < 0.55, put brand and model in uncertainFields (or omit them from knownFields).`,
            },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || "";
    const parsed = IdentificationSchema.parse(JSON.parse(text));

    const brand = parsed.brand?.trim() || "";
    const model = parsed.model?.trim() || "";
    const known = new Set(parsed.knownFields || []);
    const uncertain = new Set(parsed.uncertainFields || []);

    // Only treat brand/model as known when model returned them AND confidence is decent.
    if (brand && parsed.confidence >= 0.55) known.add("brand");
    else {
      known.delete("brand");
      if (!brand) uncertain.add("brand");
    }
    if (model && parsed.confidence >= 0.6) known.add("model");
    else {
      known.delete("model");
      if (!model) uncertain.add("model");
    }
    known.add("category");
    uncertain.add("sellSpeed");

    if (parsed.conditionLabel) known.add("condition");
    else uncertain.add("condition");

    const appCategory = mapToAppCategory(
      [parsed.category, parsed.subcategory, parsed.name].join(" "),
    );

    const prefill: IdentifyPrefill = {
      category: appCategory,
    };
    if (brand && known.has("brand")) prefill.brand = brand;
    if (model && known.has("model")) prefill.model = model;
    if (parsed.conditionLabel) prefill.condition = parsed.conditionLabel;
    if (parsed.damageVisible) prefill.damage = parsed.damageVisible;
    if (parsed.accessoriesVisible)
      prefill.accessories = parsed.accessoriesVisible;
    if (parsed.dimensionsGuess) prefill.dimensions = parsed.dimensionsGuess;

    // Display brand/model without duplicating the first word ("Bar Bar stool").
    const displayBrand = brand;
    let displayModel = model;
    if (!displayModel && parsed.name) {
      displayModel = brand
        ? parsed.name.replace(new RegExp(`^${escapeRegExp(brand)}\\s+`, "i"), "").trim()
        : parsed.name;
    } else if (displayBrand && displayModel) {
      displayModel = displayModel
        .replace(new RegExp(`^${escapeRegExp(displayBrand)}\\s+`, "i"), "")
        .trim();
    }
    if (!displayModel) displayModel = parsed.name;

    return {
      name: parsed.name,
      brand: displayBrand,
      model: displayModel,
      category: parsed.category,
      subcategory: parsed.subcategory || undefined,
      confidence: parsed.confidence,
      visibleCondition: parsed.visibleCondition || undefined,
      notes: parsed.notes || undefined,
      knownFields: [...known],
      uncertainFields: [...uncertain],
      summary:
        parsed.summary ||
        `This looks like ${parsed.name}${
          parsed.conditionLabel ? ` (${parsed.conditionLabel.toLowerCase()})` : ""
        }.`,
      prefill,
    };
  } catch (error) {
    console.error("[identify] OpenAI failed:", error);
    throw new Error(
      error instanceof Error
        ? `Vision identify failed: ${error.message}`
        : "Vision identify failed",
    );
  }
}
