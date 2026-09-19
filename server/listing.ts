import { getOpenAI, hasOpenAI, textModel } from "./openai.js";

export interface ListingDraftInput {
  brand: string;
  model: string;
  category: string;
  condition: string;
  damage?: string;
  accessories?: string;
  functional?: string;
  purchased?: string;
  dimensions?: string;
  price: number;
  location?: string;
  delivery?: string;
}

export interface ListingDraft {
  title: string;
  description: string;
}

export type PlatformDrafts = {
  ebay: ListingDraft;
  offerup: ListingDraft;
  facebook: ListingDraft;
  mercari: ListingDraft;
};

function baseFacts(item: ListingDraftInput): string[] {
  const name = [item.brand, item.model].filter(Boolean).join(" ") || "Item";
  return [
    `Selling my ${name}.`,
    item.condition ? `Condition: ${item.condition}.` : null,
    item.dimensions ? `Dimensions: ${item.dimensions}.` : null,
    item.damage ? `Notes: ${item.damage}.` : null,
    item.functional ? `Functionality: ${item.functional}.` : null,
    item.accessories ? `Included: ${item.accessories}.` : null,
    item.purchased ? `Owned: ${item.purchased}.` : null,
  ].filter(Boolean) as string[];
}

function fallbackPlatformDrafts(item: ListingDraftInput): PlatformDrafts {
  const name = [item.brand, item.model].filter(Boolean).join(" ") || "Item";
  const title = `${name} — ${item.condition || "Good"}`;
  const facts = baseFacts(item).join("\n\n");
  const pickup =
    item.delivery === "Local pickup" || !item.delivery
      ? "Local pickup preferred."
      : `${item.delivery}.`;
  const where = item.location
    ? `Near ${item.location}.`
    : "Bay Area / South Bay.";

  return {
    ebay: {
      title: title.slice(0, 80),
      description: [
        facts,
        "Ships or local pickup depending on buyer preference.",
        "Please message with questions before purchasing.",
        where,
      ].join("\n\n"),
    },
    offerup: {
      title: title.slice(0, 100),
      description: [
        facts,
        pickup,
        "Happy to answer questions — serious buyers only.",
        where,
      ].join("\n\n"),
    },
    facebook: {
      title: title.slice(0, 100),
      description: [
        facts,
        pickup,
        "Message me if you’re interested!",
        where,
      ].join("\n\n"),
    },
    mercari: {
      title: title.slice(0, 80),
      description: [
        facts,
        "Packed carefully for shipping.",
        "See photos for condition details.",
        where,
      ].join("\n\n"),
    },
  };
}

export async function generatePlatformDrafts(
  item: ListingDraftInput,
): Promise<PlatformDrafts> {
  const fallback = fallbackPlatformDrafts(item);
  if (!hasOpenAI()) return fallback;

  const client = getOpenAI()!;
  try {
    const response = await client.chat.completions.create({
      model: textModel(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Write marketplace listing copy tailored to each platform.
Return JSON:
{
  "ebay": { "title": string, "description": string },
  "offerup": { "title": string, "description": string },
  "facebook": { "title": string, "description": string },
  "mercari": { "title": string, "description": string }
}
Tone by platform:
- ebay: structured, includes shipping/returns friendly language, factual
- offerup: casual, local meetup / pickup focused, short
- facebook: friendly neighbor tone, invite messages, local pickup
- mercari: concise, shipping-ready, condition clarity
No hype. Keep titles under 80 chars for ebay/mercari.`,
        },
        {
          role: "user",
          content: JSON.stringify(item),
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || "";
    const parsed = JSON.parse(text) as Partial<PlatformDrafts>;
    return {
      ebay: {
        title: parsed.ebay?.title || fallback.ebay.title,
        description: parsed.ebay?.description || fallback.ebay.description,
      },
      offerup: {
        title: parsed.offerup?.title || fallback.offerup.title,
        description:
          parsed.offerup?.description || fallback.offerup.description,
      },
      facebook: {
        title: parsed.facebook?.title || fallback.facebook.title,
        description:
          parsed.facebook?.description || fallback.facebook.description,
      },
      mercari: {
        title: parsed.mercari?.title || fallback.mercari.title,
        description:
          parsed.mercari?.description || fallback.mercari.description,
      },
    };
  } catch (error) {
    console.warn("[listing] platform drafts failed:", error);
    return fallback;
  }
}

/** @deprecated use generatePlatformDrafts */
export async function generateListingDraft(
  item: ListingDraftInput,
): Promise<ListingDraft> {
  const drafts = await generatePlatformDrafts(item);
  return drafts.offerup;
}
