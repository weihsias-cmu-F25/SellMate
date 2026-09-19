import {
  makeResearch,
  platformNames,
  type DetailQuestionPlan,
  type Item,
  type Research,
  type Platform,
} from "./model";

export interface IdentifyResult {
  brand: string;
  model: string;
  category: string;
  name?: string;
  confidence?: number;
  notes?: string;
  summary?: string;
  knownFields?: string[];
  uncertainFields?: string[];
  prefill?: {
    brand?: string;
    model?: string;
    category?: string;
    condition?: string;
    damage?: string;
    accessories?: string;
    dimensions?: string;
  };
  questionPlan?: DetailQuestionPlan[];
  aiEnabled?: boolean;
}

/** Replace this adapter with your backend. No credentials belong in the browser. */
export interface SellingService {
  identifySample(
    signal?: AbortSignal,
  ): Promise<IdentifyResult>;
  identifyPhoto(
    imageDataUrl: string,
    signal?: AbortSignal,
  ): Promise<IdentifyResult>;
  research(item: Item, signal?: AbortSignal): Promise<
    Research & {
      reason?: string;
      source?: "live" | "curated" | "ai_estimate" | "none";
    }
  >;
  generateListingDraft(
    item: Item,
    signal?: AbortSignal,
  ): Promise<{
    title: string;
    description: string;
    byPlatform?: Partial<
      Record<Platform, { title: string; description: string }>
    >;
  }>;
  refreshQuestions(
    item: Item,
    signal?: AbortSignal,
  ): Promise<DetailQuestionPlan[]>;
  publish(
    item: Item,
    platform: Platform,
    signal?: AbortSignal,
  ): Promise<{ publishedAt: string; url?: string }>;
  updatePrice(item: Item, price: number, signal?: AbortSignal): Promise<void>;
  closeListing(item: Item, signal?: AbortSignal): Promise<void>;
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted)
      return reject(new DOMException("Aborted", "AbortError"));
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function api<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || `Request failed (${res.status})`,
    );
  }
  return data as T;
}

const headphonesPlan: DetailQuestionPlan[] = [
  {
    field: "purchased",
    text: "About how long have you had them?",
    placeholder: "e.g. Bought in 2024",
    choices: [
      { label: "Under a year", value: "Under a year" },
      { label: "1–2 years", value: "1–2 years" },
      { label: "Over 2 years", value: "Over 2 years" },
      { label: "Not sure", value: "Not sure" },
    ],
  },
  {
    field: "condition",
    text: "How’s the cosmetic condition?",
    placeholder: "e.g. Small scratch on the ear cup…",
    choices: [
      { label: "Like new", value: "Excellent" },
      { label: "Light wear", value: "Good" },
      { label: "Visible wear", value: "Fair" },
    ],
  },
  {
    field: "functional",
    text: "Do both sides, charging, and the controls work?",
    placeholder: "Or tell me what you’ve noticed…",
    choices: [
      { label: "Yes, all working", value: "Yes" },
      { label: "There’s an issue", value: "Not fully working" },
      { label: "Not sure", value: "Not sure" },
    ],
  },
  {
    field: "accessories",
    text: "Do you still have the case or cable?",
    placeholder: "Or list what’s included…",
    choices: [
      { label: "Case + cable", value: "Case + cable" },
      { label: "Case only", value: "Case only" },
      { label: "Headphones only", value: "Headphones only" },
      { label: "Not sure", value: "Not sure" },
    ],
  },
  {
    field: "sellSpeed",
    text: "How quickly do you need to sell?",
    placeholder: "Or describe your timeline…",
    choices: [
      { label: "ASAP (1–3 days)", value: "quick" },
      { label: "About a week", value: "normal" },
      { label: "Not in a hurry", value: "max" },
    ],
  },
];

export const sellingService: SellingService = {
  async identifySample(signal) {
    try {
      // Prefer agent health; sample identity stays the headphones demo.
      await fetch("/api/health", { signal });
    } catch {
      /* offline fallback below */
    }
    await delay(400, signal);
    return {
      brand: "Sony",
      model: "WH-1000XM5",
      category: "Headphones",
      name: "Sony WH-1000XM5",
      confidence: 1,
      questionPlan: headphonesPlan,
      aiEnabled: false,
    };
  },

  async identifyPhoto(imageDataUrl, signal) {
    return api<IdentifyResult>("/api/identify", { imageDataUrl }, signal);
  },

  async research(item, signal) {
    try {
      return await api<
        Research & {
          reason?: string;
          source?: "live" | "curated" | "ai_estimate" | "none";
        }
      >("/api/research", { item }, signal);
    } catch {
      await delay(800, signal);
      return makeResearch(item);
    }
  },

  async generateListingDraft(item, signal) {
    try {
      const data = await api<{
        draft: { title: string; description: string };
        drafts?: Record<
          string,
          { title: string; description: string }
        >;
      }>("/api/listings", { item }, signal);
      return {
        title: data.draft.title,
        description: data.draft.description,
        byPlatform: data.drafts as
          | Partial<Record<Platform, { title: string; description: string }>>
          | undefined,
      };
    } catch {
      await delay(300, signal);
      return {
        title: `${[item.brand, item.model].filter(Boolean).join(" ")} — ${item.condition || "Good"}`,
        description: `${[item.brand, item.model].filter(Boolean).join(" ")} in ${(item.condition || "good").toLowerCase()} condition.`,
      };
    }
  },

  async refreshQuestions(item, signal) {
    const data = await api<{ questionPlan: DetailQuestionPlan[] }>(
      "/api/questions",
      { item },
      signal,
    );
    return data.questionPlan;
  },

  async publish(item, platform, signal) {
    if (
      import.meta.env.VITE_DEMO_FAIL_PUBLISH === "true" ||
      (import.meta.env.VITE_DEMO_FAIL_PLATFORMS || "")
        .split(",")
        .includes(platform)
    )
      throw new Error(
        `${platformNames[platform]} could not be reached in this demo. Your draft is safe. Try again.`,
      );
    if (
      !item.reviewed ||
      item.price <= 0 ||
      !item.listings[platform].title.trim() ||
      !item.listings[platform].description.trim()
    )
      throw new Error(
        "Review your listing and choose a price before publishing.",
      );
    try {
      return await api<{ publishedAt: string; url?: string }>(
        "/api/publish",
        { item, platform },
        signal,
      );
    } catch (error) {
      if (error instanceof Error && /could not be reached/i.test(error.message))
        throw error;
      await delay(platform === "offerup" ? 1200 : 700, signal);
      return { publishedAt: new Date().toISOString() };
    }
  },

  async updatePrice(_item, price, signal) {
    if (!Number.isFinite(price) || price < 1)
      throw new Error("Choose a valid price.");
    try {
      await api("/api/update-price", { price }, signal);
    } catch {
      await delay(500, signal);
    }
  },

  async closeListing(_item, signal) {
    try {
      await api("/api/close-listing", {}, signal);
    } catch {
      await delay(500, signal);
    }
  },
};

export async function readPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPG, PNG, or WebP photo.");
  if (file.size > 8 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 8 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error(
        "Your browser could not process this photo. Try a different image.",
      );
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } finally {
    URL.revokeObjectURL(url);
  }
}
