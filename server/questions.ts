import { z } from "zod";
import { getOpenAI, hasOpenAI, textModel } from "./openai.js";
import type { AgentQuestion, IdentifiedItem } from "./types.js";

const QuestionSchema = z.object({
  questions: z
    .array(
      z.object({
        field: z.enum([
          "brand",
          "model",
          "category",
          "purchased",
          "condition",
          "functional",
          "damage",
          "accessories",
          "dimensions",
          "sellSpeed",
        ]),
        text: z.string(),
        hint: z.string().optional(),
        placeholder: z.string().optional(),
        inputType: z.enum(["choice", "text", "both"]).optional(),
        choices: z
          .array(z.object({ label: z.string(), value: z.string() }))
          .optional(),
      }),
    )
    .min(1)
    .max(5),
});

const choices = (...values: string[]) =>
  values.map((value) => ({ label: value, value }));

function isFilled(value?: string): boolean {
  return Boolean(value?.trim());
}

const DEFAULT_CHOICES: Record<string, { label: string; value: string }[]> = {
  brand: choices("Unbranded", "Not sure"),
  model: choices("Not sure"),
  category: [
    { label: "Headphones", value: "Headphones" },
    { label: "Cameras", value: "Cameras" },
    { label: "Home & living", value: "Home & living" },
    { label: "Other", value: "Other" },
  ],
  purchased: choices("Under a year", "1–2 years", "Over 2 years", "Not sure"),
  condition: [
    { label: "Like new", value: "Excellent" },
    { label: "Light wear", value: "Good" },
    { label: "Visible wear", value: "Fair" },
  ],
  functional: [
    { label: "Yes, all working", value: "Yes" },
    { label: "There’s an issue", value: "Not fully working" },
    { label: "Not sure", value: "Not sure" },
  ],
  damage: choices("No damage", "Minor wear only", "Not sure"),
  accessories: choices("Everything original", "Just the item", "Not sure"),
  dimensions: choices("Not sure", "Compact / small", "Standard size", "Large"),
  sellSpeed: [
    { label: "ASAP (1–3 days)", value: "quick" },
    { label: "About a week", value: "normal" },
    { label: "Not in a hurry", value: "max" },
  ],
};

/** Every question must offer tap choices; free-text remains optional. */
function ensureChoices(q: AgentQuestion): AgentQuestion {
  const defaults = DEFAULT_CHOICES[q.field] || choices("Not sure", "Other");
  const existing = q.choices?.filter((c) => c.label && c.value) || [];
  // Prefer at least 2 choices; merge defaults if LLM only gave one.
  const merged =
    existing.length >= 2
      ? existing
      : [
          ...existing,
          ...defaults.filter(
            (d) => !existing.some((e) => e.value === d.value),
          ),
        ].slice(0, 5);
  return {
    ...q,
    placeholder: q.placeholder || "Or type your own answer…",
    inputType: "both",
    choices: merged.length >= 2 ? merged : defaults,
  };
}

const SELL_SPEED_Q: AgentQuestion = {
  field: "sellSpeed",
  text: "How quickly do you need to sell before you move?",
  placeholder: "Your timeline…",
  inputType: "both",
  choices: [
    { label: "ASAP (1–3 days)", value: "quick" },
    { label: "About a week", value: "normal" },
    { label: "Not in a hurry", value: "max" },
  ],
};

const CONDITION_Q = (name: string): AgentQuestion => ({
  field: "condition",
  text: `How’s the ${name} looking overall?`,
  placeholder: "Describe wear…",
  inputType: "both",
  choices: [
    { label: "Like new", value: "Excellent" },
    { label: "Light wear", value: "Good" },
    { label: "Visible wear", value: "Fair" },
  ],
});

/** Ensure plan has 3–5 questions for a solid demo conversation. */
function enforceQuestionCount(
  plan: AgentQuestion[],
  id: IdentifiedItem,
  known?: Partial<Record<string, string>>,
): AgentQuestion[] {
  const out = [...plan].filter((q, i, arr) =>
    arr.findIndex((x) => x.field === q.field) === i,
  );

  const need = (field: string) =>
    !out.some((q) => q.field === field) && !isFilled(known?.[field]);

  if (need("sellSpeed")) out.push(SELL_SPEED_Q);
  if (need("condition")) out.push(CONDITION_Q(id.name || "item"));

  const hay = [id.name, id.category, id.brand, id.model].join(" ").toLowerCase();
  if (out.length < 3 && need("damage")) {
    out.push({
      field: "damage",
      text: "Any scratches, stains, or other issues a buyer should know?",
      placeholder: "e.g. Small scratch on the top…",
      inputType: "both",
      choices: choices("No damage", "Not sure"),
    });
  }
  if (out.length < 3 && /desk|table|furniture|chair|fridge/.test(hay) && need("dimensions")) {
    out.push({
      field: "dimensions",
      text: "About what size is it (W × D × H)?",
      placeholder: "e.g. 105 × 50 × 75 cm",
      inputType: "both",
      choices: choices("Not sure"),
    });
  }
  if (out.length < 3 && need("accessories")) {
    out.push({
      field: "accessories",
      text: "What’s included with it?",
      placeholder: "e.g. Charger, case, cables…",
      inputType: "both",
      choices: choices("Everything original", "Just the item", "Not sure"),
    });
  }
  if (out.length < 3 && need("functional")) {
    out.push({
      field: "functional",
      text: "Does everything work as it should?",
      placeholder: "Any issues…",
      inputType: "both",
      choices: [
        { label: "Yes, all working", value: "Yes" },
        { label: "There’s an issue", value: "Not fully working" },
        { label: "Not sure", value: "Not sure" },
      ],
    });
  }

  // Still short? ask purchased as a soft filler.
  if (out.length < 3 && need("purchased")) {
    out.push({
      field: "purchased",
      text: "About how long have you had it?",
      placeholder: "e.g. About a year",
      inputType: "both",
      choices: choices("Under a year", "1–2 years", "Over 2 years", "Not sure"),
    });
  }

  return out.slice(0, 5).map(ensureChoices);
}

/** Rule-based fallback: aim for 3–5 targeted questions. */
export function buildQuestionPlanFallback(
  id: IdentifiedItem,
  known?: Partial<Record<string, string>>,
): AgentQuestion[] {
  const hay = [id.name, id.category, id.subcategory, id.brand, id.model]
    .join(" ")
    .toLowerCase();
  const knownSet = new Set(
    (id.knownFields || []).map((f) => f.toLowerCase()),
  );
  const uncertain = new Set(
    (id.uncertainFields || []).map((f) => f.toLowerCase()),
  );
  const filled = (field: string) =>
    isFilled(known?.[field]) ||
    (knownSet.has(field) &&
      isFilled(
        field === "brand"
          ? id.brand
          : field === "model"
            ? id.model
            : field === "category"
              ? id.category
              : known?.[field],
      ));

  const plan: AgentQuestion[] = [];
  const push = (q: AgentQuestion) => {
    if (plan.length >= 5) return;
    if (filled(q.field) && !uncertain.has(q.field)) return;
    if (plan.some((p) => p.field === q.field)) return;
    plan.push(q);
  };

  if (
    (!isFilled(known?.brand) && !filled("brand")) &&
    (id.confidence < 0.55 || uncertain.has("brand") || !id.brand)
  ) {
    push({
      field: "brand",
      text:
        id.brand && id.confidence >= 0.4
          ? `I think the brand is ${id.brand}. Is that right?`
          : `What brand is this ${id.name}?`,
      placeholder: "Brand name…",
      inputType: "both",
      choices: id.brand
        ? [
            { label: `Yes, ${id.brand}`, value: id.brand },
            { label: "Different / not sure", value: "Not sure" },
          ]
        : choices("Unbranded", "Not sure"),
    });
  }

  if (
    (!isFilled(known?.model) && !filled("model")) &&
    (id.confidence < 0.55 || uncertain.has("model") || !id.model)
  ) {
    push({
      field: "model",
      text: id.model
        ? `Is the model “${id.model}”?`
        : `Do you know the model of this ${id.brand || "item"}?`,
      placeholder: "Model…",
      inputType: "both",
      choices: id.model
        ? [
            { label: `Yes, ${id.model}`, value: id.model },
            { label: "Not sure", value: "Not sure" },
          ]
        : choices("Not sure"),
    });
  }

  if (!filled("condition") || uncertain.has("condition")) {
    push(CONDITION_Q(id.name));
  }

  if (/desk|table|furniture|chair|fridge|shelf/.test(hay)) {
    if (!filled("dimensions") || uncertain.has("dimensions")) {
      push({
        field: "dimensions",
        text: "About what size is it (W × D × H)?",
        placeholder: "e.g. 105 × 50 × 75 cm",
        inputType: "both",
        choices: choices("Not sure"),
      });
    }
    if (!filled("damage") || uncertain.has("damage")) {
      push({
        field: "damage",
        text: "Any scratches, stains, or missing parts?",
        placeholder: "e.g. Scratch near drawer…",
        inputType: "both",
        choices: choices("No damage", "Not sure"),
      });
    }
  } else if (/laptop|macbook|phone|headphone|camera|bike|bicycle/.test(hay)) {
    if (!filled("functional") || uncertain.has("functional")) {
      push({
        field: "functional",
        text: "Does everything work as it should?",
        placeholder: "Any issues…",
        inputType: "both",
        choices: [
          { label: "Yes, all working", value: "Yes" },
          { label: "There’s an issue", value: "Not fully working" },
          { label: "Not sure", value: "Not sure" },
        ],
      });
    }
    if (!filled("accessories") || uncertain.has("accessories")) {
      push({
        field: "accessories",
        text: "What’s included with it?",
        placeholder: "e.g. Charger, case…",
        inputType: "both",
        choices: choices("Everything original", "Just the item", "Not sure"),
      });
    }
  }

  if (!filled("sellSpeed")) push(SELL_SPEED_Q);

  return enforceQuestionCount(plan, id, known);
}

export async function buildQuestionPlanLLM(
  id: IdentifiedItem,
  known?: Partial<Record<string, string>>,
): Promise<AgentQuestion[]> {
  if (!hasOpenAI()) return buildQuestionPlanFallback(id, known);

  const client = getOpenAI()!;
  try {
    const response = await client.chat.completions.create({
      model: textModel(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You write follow-up questions for a moving/resale agent AFTER vision inspected the photo.

Return JSON: { "questions": [ ... exactly 3 to 5 items ... ] }

Each question:
{
  "field": brand|model|category|purchased|condition|functional|damage|accessories|dimensions|sellSpeed,
  "text": short, specific to this item,
  "hint"?: string,
  "placeholder": string (always include),
  "inputType": "choice"|"text"|"both",
  "choices"?: [{ "label", "value" }]
}

Hard rules:
1. Return EXACTLY 3, 4, or 5 questions (never fewer than 3).
2. Do NOT ask brand, model, or category — identity is already confirmed from the photo.
3. Always include sellSpeed.
4. Prefer condition, then 1–2 item-specific gaps (dimensions / damage / functional / accessories).
5. EVERY question MUST include 3–5 choices (tap options). Free-text is optional on top.
6. Always set placeholder.
7. Prefer inputType "both".`,
        },
        {
          role: "user",
          content: JSON.stringify({
            identified: {
              name: id.name,
              brand: id.brand,
              model: id.model,
              category: id.category,
              confidence: id.confidence,
              summary: id.summary,
              knownFields: id.knownFields,
              uncertainFields: id.uncertainFields,
              visibleCondition: id.visibleCondition,
            },
            alreadyKnown: known || {},
          }),
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || "";
    const parsed = QuestionSchema.parse(JSON.parse(text));
    const questions = parsed.questions.slice(0, 5).map((q) =>
      ensureChoices({
        field: q.field,
        text: q.text,
        hint: q.hint,
        placeholder: q.placeholder || "Or type your own answer…",
        inputType: "both",
        choices: q.choices,
      }),
    );

    return enforceQuestionCount(questions, id, known);
  } catch (error) {
    console.error("[questions] LLM failed, using fallback:", error);
    return buildQuestionPlanFallback(id, known);
  }
}

export function buildQuestionPlan(id: IdentifiedItem): AgentQuestion[] {
  return buildQuestionPlanFallback(id);
}
