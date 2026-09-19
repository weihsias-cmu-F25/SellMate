import { makeResearch, type Item, type Research } from "./model";

/** Replace this adapter with your backend. No credentials belong in the browser. */
export interface SellingService {
  identifySample(
    signal?: AbortSignal,
  ): Promise<{ brand: string; model: string; category: string }>;
  research(item: Item, signal?: AbortSignal): Promise<Research>;
  publish(item: Item, signal?: AbortSignal): Promise<{ publishedAt: string }>;
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
export const sellingService: SellingService = {
  async identifySample(signal) {
    await delay(1100, signal);
    return { brand: "Sony", model: "WH-1000XM5", category: "Headphones" };
  },
  async research(item, signal) {
    await delay(1500, signal);
    return makeResearch(item);
  },
  async publish(item, signal) {
    await delay(1600, signal);
    if (import.meta.env.VITE_DEMO_FAIL_PUBLISH === "true")
      throw new Error(
        "The demo marketplace could not be reached. Your draft is safe. Try again.",
      );
    if (!item.reviewed || item.price <= 0)
      throw new Error(
        "Review your listing and choose a price before publishing.",
      );
    return { publishedAt: new Date().toISOString() };
  },
  async updatePrice(_item, price, signal) {
    if (!Number.isFinite(price) || price < 1)
      throw new Error("Choose a valid price.");
    await delay(900, signal);
  },
  async closeListing(_item, signal) {
    await delay(1100, signal);
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
