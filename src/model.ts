export const PLATFORMS = ["ebay", "facebook", "offerup", "mercari"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const INTEGRATED_PLATFORMS: Platform[] = ["ebay", "offerup"];
export type Connections = Record<Platform, boolean>;
export const defaultConnections = (): Connections => ({
  ebay: true,
  offerup: true,
  facebook: false,
  mercari: false,
});
export const platformNames: Record<Platform, string> = {
  ebay: "eBay",
  facebook: "Facebook Marketplace",
  offerup: "OfferUp",
  mercari: "Mercari",
};
export const platformUrls: Record<Platform, string> = {
  ebay: "https://www.ebay.com/",
  facebook: "https://www.facebook.com/marketplace/",
  offerup: "https://offerup.com/",
  mercari: "https://www.mercari.com/",
};
export type ListingStatus =
  "draft" | "awaiting" | "live" | "ended" | "needs-removal" | "error";
export interface Listing {
  managed?: boolean;
  status: ListingStatus;
  title: string;
  description: string;
  price: number;
  url?: string;
  publishedAt?: string;
  error?: string;
}
export interface Comparable {
  id: string;
  title: string;
  platform: string;
  type: "Sold" | "Asking";
  price: number;
  condition: string;
  source?: "live" | "curated" | "ai_estimate";
  url?: string;
}
export interface Research {
  fast: number;
  recommended: number;
  max: number;
  checkedAt: string;
  comparables: Comparable[];
  reason?: string;
  source?: "live" | "curated" | "ai_estimate" | "none";
}
export interface Activity {
  id: string;
  text: string;
  at: string;
}
export const DETAIL_FIELDS = [
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
] as const;
export type DetailField = (typeof DETAIL_FIELDS)[number];
export interface DetailReply {
  field: DetailField;
  question: string;
  answer: string;
}
export interface DetailQuestionPlan {
  field: DetailField;
  text: string;
  hint?: string;
  placeholder: string;
  inputType?: "choice" | "text" | "both";
  choices?: { label: string; value: string }[];
}
export interface Item {
  id: string;
  brand: string;
  model: string;
  category: string;
  photos: string[];
  sample: boolean;
  purchased: string;
  condition: string;
  damage: string;
  accessories: string;
  functional: string;
  dimensions: string;
  sellSpeed: string;
  price: number;
  stage: number;
  status: "draft" | "active" | "sold";
  delivery: string;
  location: string;
  reviewed: boolean;
  research?: Research;
  listings: Record<Platform, Listing>;
  createdAt: string;
  publishedAt?: string;
  lastReviewAt?: string;
  soldAt?: string;
  salePrice?: number;
  soldOn?: string;
  activity: Activity[];
  detailReplies?: DetailReply[];
  /** Agent-built 3–5 question plan from photo identification. */
  questionPlan?: DetailQuestionPlan[];
  identificationNotes?: string;
  publishTargets?: Platform[];
}
export interface AppState {
  version: 1;
  items: Item[];
  connections: Connections;
  reminderDays: number;
}
export const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 ? 2 : 0,
  }).format(n);
export const itemName = (i: Item) => {
  const brand = i.brand.trim();
  const model = i.model.trim();
  if (!brand && !model) return "Your next great sale";
  if (!brand) return model;
  if (!model) return brand;
  // Avoid "Bar Bar stool" when model already starts with brand.
  if (model.toLowerCase().startsWith(brand.toLowerCase() + " ")) return model;
  if (model.toLowerCase() === brand.toLowerCase()) return brand;
  return `${brand} ${model}`;
};
export const ageInDays = (date?: string, now = Date.now()) =>
  date
    ? Math.max(0, Math.floor((now - new Date(date).getTime()) / 86400000))
    : 0;
export const needsReview = (item: Item, days: number, now = Date.now()) =>
  days > 0 &&
  item.status === "active" &&
  ageInDays(item.lastReviewAt || item.publishedAt, now) >= days;
export const suggestedPrice = (price: number) =>
  Math.max(1, Math.round(price * 0.92));
export const hasCleanup = (i: Item) =>
  i.status === "sold" &&
  PLATFORMS.some((p) => i.listings[p].status === "needs-removal");
export function log(item: Item, text: string): Item {
  return {
    ...item,
    activity: [
      { id: crypto.randomUUID(), text, at: new Date().toISOString() },
      ...item.activity,
    ],
  };
}
export function blankItem(): Item {
  return {
    id: crypto.randomUUID(),
    brand: "",
    model: "",
    category: "Headphones",
    photos: [],
    sample: false,
    purchased: "",
    condition: "",
    damage: "",
    accessories: "",
    functional: "",
    dimensions: "",
    sellSpeed: "",
    price: 0,
    stage: 0,
    status: "draft",
    delivery: "Local pickup",
    location: "",
    reviewed: false,
    createdAt: new Date().toISOString(),
    listings: Object.fromEntries(
      PLATFORMS.map((p) => [
        p,
        { status: "draft", title: "", description: "", price: 0 },
      ]),
    ) as Item["listings"],
    activity: [],
  };
}
/** A changed fact or price requires another review before any new publication. */
export function revise(item: Item, patch: Partial<Item>): Item {
  const facts = [
    "brand",
    "model",
    "category",
    "purchased",
    "condition",
    "damage",
    "accessories",
    "functional",
    "dimensions",
    "sellSpeed",
  ];
  const changedFacts = facts.some(
    (k) => k in patch && patch[k as keyof Item] !== item[k as keyof Item],
  );
  const changedPrice = patch.price !== undefined && patch.price !== item.price;
  const listings = changedFacts
    ? (Object.fromEntries(
        PLATFORMS.map((p) => [
          p,
          ["live", "ended", "needs-removal"].includes(item.listings[p].status)
            ? item.listings[p]
            : { ...item.listings[p], title: "", description: "" },
        ]),
      ) as Item["listings"])
    : item.listings;
  return {
    ...item,
    ...patch,
    listings,
    ...(changedFacts ? { research: undefined } : {}),
    ...(changedFacts || changedPrice ? { reviewed: false } : {}),
  };
}
export function generateListings(
  item: Item,
  draft?: {
    title?: string;
    description?: string;
    byPlatform?: Partial<
      Record<Platform, { title?: string; description?: string }>
    >;
  },
): Item {
  const fallbackTitle = `${itemName(item)} — ${item.condition || "Good"}`;
  const fallbackBase =
    draft?.description ||
    `${itemName(item)} in ${(item.condition || "good").toLowerCase()} condition. ${item.dimensions ? `Dimensions: ${item.dimensions}. ` : ""}${item.damage ? `Wear and damage: ${item.damage}. ` : ""}${item.purchased ? `Purchased ${item.purchased}. ` : ""}${item.functional === "Yes" ? "Tested and working. " : item.functional ? `Functionality: ${item.functional.toLowerCase()}. ` : ""}${item.accessories ? `Included: ${item.accessories}.` : ""}`.trim();

  const platformBlurb: Record<Platform, (base: string) => string> = {
    ebay: (base) =>
      `${base}\n\nShips or local pickup depending on buyer preference. Message with questions before buying.`,
    offerup: (base) =>
      `${base}\n\n${item.delivery === "Local pickup" || !item.delivery ? "Local pickup preferred." : item.delivery} Happy to answer questions.`,
    facebook: (base) =>
      `${base}\n\n${item.delivery === "Local pickup" || !item.delivery ? "Available for local pickup." : "Shipping available."} Message me if you’re interested!`,
    mercari: (base) =>
      `${base}\n\nPacked carefully for shipping. See photos for condition details.`,
  };

  return {
    ...item,
    reviewed: false,
    listings: Object.fromEntries(
      PLATFORMS.map((p) => {
        const current = item.listings[p];
        if (
          current.status === "live" ||
          current.status === "ended" ||
          current.status === "needs-removal"
        )
          return [p, current];
        const platformDraft = draft?.byPlatform?.[p];
        const title = (
          platformDraft?.title ||
          draft?.title ||
          fallbackTitle
        ).slice(0, p === "ebay" || p === "mercari" ? 80 : 120);
        const description =
          platformDraft?.description ||
          platformBlurb[p](fallbackBase);
        return [
          p,
          {
            ...current,
            title,
            description,
            price: item.price,
          },
        ];
      }),
    ) as Item["listings"],
  };
}
export function isManaged(item: Item, platform: Platform): boolean {
  return (
    item.listings[platform].managed ??
    (platform === "ebay" && !item.listings[platform].url)
  );
}
export function changePrice(item: Item, price: number): Item {
  const next = {
    ...item,
    price,
    lastReviewAt: new Date().toISOString(),
    listings: Object.fromEntries(
      PLATFORMS.map((p) => [
        p,
        {
          ...item.listings[p],
          price:
            isManaged(item, p) && item.listings[p].status === "live"
              ? price
              : item.listings[p].price,
        },
      ]),
    ) as Item["listings"],
  };
  return log(
    next,
    `Asking price updated to ${money(price)} · connected listings synced in demo`,
  );
}
export function markSold(item: Item, salePrice: number, soldOn: string): Item {
  const listings = Object.fromEntries(
    PLATFORMS.map((p) => [
      p,
      {
        ...item.listings[p],
        status: ["live", "awaiting"].includes(item.listings[p].status)
          ? isManaged(item, p) && item.listings[p].status === "live"
            ? "ended"
            : "needs-removal"
          : item.listings[p].status,
      },
    ]),
  ) as Item["listings"];
  return log(
    {
      ...item,
      status: "sold",
      soldAt: new Date().toISOString(),
      salePrice,
      soldOn,
      listings,
    },
    `Sold for ${money(salePrice)} on ${soldOn}`,
  );
}
export function validateListingUrl(
  value: string,
  platform: Platform,
): string | null {
  try {
    const u = new URL(value);
    const domain = {
      ebay: "ebay.com",
      facebook: "facebook.com",
      offerup: "offerup.com",
      mercari: "mercari.com",
    }[platform];
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (u.hostname === domain || u.hostname.endsWith(`.${domain}`))
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function makeResearch(item: Item): Research {
  const base =
    item.category === "Cameras"
      ? 495
      : item.category === "Home & living"
        ? 45
        : item.category === "Headphones"
          ? 205
          : 60;
  const adjustment =
    item.condition === "Fair" ? 0.7 : item.condition === "Good" ? 0.9 : 1;
  const recommended = Math.round(base * adjustment);
  return {
    fast:
      base === 205 && adjustment === 1 ? 175 : Math.round(recommended * 0.85),
    recommended,
    max:
      base === 205 && adjustment === 1 ? 229 : Math.round(recommended * 1.12),
    checkedAt: new Date().toISOString(),
    comparables: [
      {
        id: "c1",
        title: `${itemName(item)} · similar condition`,
        platform: "eBay",
        type: "Sold",
        price: Math.round(recommended * 0.97),
        condition: item.condition,
      },
      {
        id: "c2",
        title: `${itemName(item)} · with accessories`,
        platform: "eBay",
        type: "Sold",
        price: Math.round(recommended * 1.025),
        condition: item.condition,
      },
      {
        id: "c3",
        title: `${itemName(item)} · seller asking price`,
        platform: "Facebook",
        type: "Asking",
        price: Math.round(recommended * 1.12),
        condition: item.condition,
      },
    ],
  };
}
export function seedState(): AppState {
  const date = new Date(Date.now() - 8 * 86400000).toISOString();
  let headphones = {
    ...blankItem(),
    brand: "Sony",
    model: "WH-1000XM5",
    category: "Headphones",
    photos: ["/headphones.svg"],
    sample: true,
    purchased: "2024-11",
    condition: "Excellent",
    accessories: "Original case, charging cable",
    functional: "Yes",
    price: 205,
    stage: 4,
    location: "San Francisco, CA",
  };
  headphones = generateListings(headphones);
  headphones.research = makeResearch(headphones);
  headphones.status = "active";
  headphones.publishedAt = date;
  headphones.reviewed = true;
  headphones.listings.ebay = {
    ...headphones.listings.ebay,
    status: "live",
    publishedAt: date,
  };
  headphones.listings.facebook = {
    ...headphones.listings.facebook,
    status: "live",
    publishedAt: date,
  };
  headphones.activity = [
    {
      id: "seed-publish",
      text: "Example listings published on eBay and Facebook",
      at: date,
    },
  ];
  const camera = {
    ...blankItem(),
    brand: "Fujifilm",
    model: "X-T20",
    category: "Cameras",
    photos: ["/camera.svg"],
    sample: true,
    stage: 1,
  };
  const lamp = markSold(
    {
      ...blankItem(),
      brand: "IKEA",
      model: "Table lamp",
      category: "Home & living",
      photos: ["/lamp.svg"],
      sample: true,
      price: 35,
    },
    35,
    "Local sale",
  );
  return {
    version: 1,
    items: [headphones, camera, lamp],
    connections: defaultConnections(),
    reminderDays: 7,
  };
}
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const validPhoto = (v: unknown) =>
  typeof v === "string" &&
  (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ||
    ["/headphones.svg", "/camera.svg", "/lamp.svg"].includes(v));
export function parseState(raw: string | null): AppState | null {
  if (!raw) return null;
  try {
    const s: unknown = JSON.parse(raw);
    // Upgrade existing browser workspaces without dropping their saved items.
    if (
      isObject(s) &&
      s.version === 1 &&
      s.connections === undefined &&
      typeof s.connected === "boolean"
    ) {
      s.connections = { ...defaultConnections(), ebay: s.connected };
      delete s.connected;
    }
    if (
      !isObject(s) ||
      s.version !== 1 ||
      !Array.isArray(s.items) ||
      !isObject(s.connections) ||
      !PLATFORMS.every(
        (p) =>
          typeof (s.connections as Record<string, unknown>)[p] === "boolean",
      ) ||
      ![0, 7, 14].includes(s.reminderDays as number)
    )
      return null;
    for (const i of s.items) {
      if (
        !isObject(i) ||
        !["draft", "active", "sold"].includes(i.status as string) ||
        typeof i.id !== "string" ||
        !/^[a-zA-Z0-9-]+$/.test(i.id) ||
        typeof i.sample !== "boolean" ||
        typeof i.reviewed !== "boolean"
      )
        return null;
      for (const key of [
        "brand",
        "model",
        "category",
        "purchased",
        "condition",
        "damage",
        "accessories",
        "functional",
        "delivery",
        "location",
        "createdAt",
      ])
        if (typeof i[key] !== "string") return null;
      // Upgrade older workspaces saved before agent fields existed.
      if (typeof i.dimensions !== "string") i.dimensions = "";
      if (typeof i.sellSpeed !== "string") i.sellSpeed = "";
      if (i.questionPlan !== undefined && !Array.isArray(i.questionPlan))
        return null;
      if (
        i.identificationNotes !== undefined &&
        typeof i.identificationNotes !== "string"
      )
        return null;
      if (
        !Array.isArray(i.photos) ||
        !i.photos.every(validPhoto) ||
        !Number.isFinite(i.price) ||
        (i.price as number) < 0 ||
        !Number.isInteger(i.stage) ||
        (i.stage as number) < 0 ||
        (i.stage as number) > 4
      )
        return null;
      if (
        !Array.isArray(i.activity) ||
        !i.activity.every(
          (a) =>
            isObject(a) &&
            ["id", "text", "at"].every((k) => typeof a[k] === "string"),
        )
      )
        return null;
      if (
        i.detailReplies !== undefined &&
        (!Array.isArray(i.detailReplies) ||
          !i.detailReplies.every(
            (r) =>
              isObject(r) &&
              DETAIL_FIELDS.includes(r.field as DetailField) &&
              typeof r.question === "string" &&
              typeof r.answer === "string",
          ))
      )
        return null;
      for (const k of ["publishedAt", "lastReviewAt", "soldAt"])
        if (
          i[k] !== undefined &&
          (typeof i[k] !== "string" ||
            !Number.isFinite(Date.parse(i[k] as string)))
        )
          return null;
      if (
        i.salePrice !== undefined &&
        (typeof i.salePrice !== "number" ||
          !Number.isFinite(i.salePrice) ||
          i.salePrice < 0)
      )
        return null;
      if (i.soldOn !== undefined && typeof i.soldOn !== "string") return null;
      if (
        i.publishTargets !== undefined &&
        (!Array.isArray(i.publishTargets) ||
          !i.publishTargets.every((p) =>
            INTEGRATED_PLATFORMS.includes(p as Platform),
          ) ||
          new Set(i.publishTargets).size !== i.publishTargets.length)
      )
        return null;
      if (!isObject(i.listings)) return null;
      for (const p of PLATFORMS) {
        const l = i.listings[p];
        if (
          isObject(l) &&
          l.managed !== undefined &&
          typeof l.managed !== "boolean"
        )
          return null;
        if (
          !isObject(l) ||
          ![
            "draft",
            "awaiting",
            "live",
            "ended",
            "needs-removal",
            "error",
          ].includes(l.status as string) ||
          typeof l.title !== "string" ||
          typeof l.description !== "string" ||
          !Number.isFinite(l.price)
        )
          return null;
        if (
          l.url !== undefined &&
          (typeof l.url !== "string" || !validateListingUrl(l.url, p))
        )
          return null;
      }
      if (i.research !== undefined) {
        const r = i.research;
        if (
          !isObject(r) ||
          !["fast", "recommended", "max"].every(
            (k) => typeof r[k] === "number" && Number.isFinite(r[k]),
          ) ||
          typeof r.checkedAt !== "string" ||
          !Array.isArray(r.comparables)
        )
          return null;
        if (
          !r.comparables.every(
            (c) =>
              isObject(c) &&
              ["id", "title", "platform", "condition"].every(
                (k) => typeof c[k] === "string",
              ) &&
              ["Sold", "Asking"].includes(c.type as string) &&
              typeof c.price === "number" &&
              Number.isFinite(c.price),
          )
        )
          return null;
      }
    }
    return s as unknown as AppState;
  } catch {
    return null;
  }
}
