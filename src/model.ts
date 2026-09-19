export const PLATFORMS = ["vinted", "facebook", "offerup", "mercari"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const INTEGRATED_PLATFORMS: Platform[] = ["offerup"];
export const ASSISTED_PLATFORMS: Platform[] = ["vinted", "facebook"];
export const PUBLISH_PLATFORMS: Platform[] = ["vinted", "facebook", "offerup"];
export type Connections = Record<Platform, boolean>;
export const defaultConnections = (): Connections => ({
  vinted: true,
  offerup: true,
  facebook: false,
  mercari: false,
});
export const platformNames: Record<Platform, string> = {
  vinted: "Vinted",
  facebook: "Facebook Marketplace",
  offerup: "OfferUp",
  mercari: "Mercari",
};
export const platformUrls: Record<Platform, string> = {
  vinted: "https://www.vinted.com/",
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
}
export interface Research {
  fast: number;
  recommended: number;
  max: number;
  checkedAt: string;
  comparables: Comparable[];
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
] as const;
export type DetailField = (typeof DETAIL_FIELDS)[number];
export interface DetailReply {
  field: DetailField;
  question: string;
  answer: string;
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
export const itemName = (i: Item) =>
  [i.brand, i.model].filter(Boolean).join(" ") || "Your next great sale";
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
    price: 0,
    stage: 0,
    status: "draft",
    delivery: "Buyer-paid shipping",
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
export function generateListings(item: Item): Item {
  const base = `${itemName(item)} in ${item.condition.toLowerCase()} condition. ${item.damage ? `Wear and damage: ${item.damage}. ` : ""}${item.purchased ? `Purchased ${item.purchased}. ` : "Purchase date unknown. "}${item.functional === "Yes" ? "Tested and working. " : `Functionality: ${item.functional.toLowerCase()}. `}${item.accessories ? `Included: ${item.accessories}.` : "No additional accessories specified."}`;
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
        return [
          p,
          {
            ...current,
            title: `${itemName(item)} — ${item.condition}`.slice(
              0,
              p === "vinted" ? 100 : 120,
            ),
            description:
              p === "facebook"
                ? `${base}\n\n${item.delivery === "Local pickup" ? "Available for local pickup." : "Shipping available."} Message me if you’re interested!`
                : p === "offerup"
                  ? `${base}\n\nHappy to answer any questions.`
                  : base,
            price: item.price,
          },
        ];
      }),
    ) as Item["listings"],
  };
}
export function isManaged(item: Item, platform: Platform): boolean {
  return item.listings[platform].managed ?? false;
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
      vinted: "vinted.com",
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
        platform: "Vinted",
        type: "Sold",
        price: Math.round(recommended * 0.97),
        condition: item.condition,
      },
      {
        id: "c2",
        title: `${itemName(item)} · with accessories`,
        platform: "Vinted",
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
  headphones.listings.vinted = {
    ...headphones.listings.vinted,
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
      text: "Example listings published on Vinted and Facebook",
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
      s.connections = { ...defaultConnections(), vinted: s.connected };
      delete s.connected;
    }
    if (isObject(s) && isObject(s.connections) && "ebay" in s.connections) {
      const connections = s.connections;
      if (typeof connections.vinted !== "boolean")
        connections.vinted = Boolean(connections.ebay);
      delete connections.ebay;
    }
    if (isObject(s) && Array.isArray(s.items)) {
      for (const item of s.items) {
        if (!isObject(item)) continue;
        if (isObject(item.listings) && "ebay" in item.listings) {
          if (!("vinted" in item.listings)) {
            const listing = item.listings.ebay;
            if (
              isObject(listing) &&
              typeof listing.url === "string" &&
              !validateListingUrl(listing.url, "vinted")
            )
              delete listing.url;
            item.listings.vinted = listing;
          }
          delete item.listings.ebay;
        }
        if (Array.isArray(item.publishTargets))
          item.publishTargets = [
            ...new Set(
              item.publishTargets.map((p) => (p === "ebay" ? "vinted" : p)),
            ),
          ];
      }
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
            PUBLISH_PLATFORMS.includes(p as Platform),
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
