import type { Item } from "./model";

const REQUEST = "SELLMATE_FACEBOOK_PREPARE";
const ACCEPTED = "SELLMATE_FACEBOOK_ACCEPTED";
const STATUS = "SELLMATE_FACEBOOK_STATUS";

export type FacebookPublishStatus = {
  requestId: string;
  itemId: string;
  state: "opened" | "filled" | "submitting" | "live" | "error";
  message?: string;
  url?: string;
};

type PortablePhoto = {
  name: string;
  type: string;
  dataUrl: string;
};

type FacebookDraft = {
  requestId: string;
  itemId: string;
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  delivery: string;
  location: string;
  photos: PortablePhoto[];
};

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not prepare a photo."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });

async function facebookPhotoBlob(blob: Blob): Promise<Blob> {
  if (["image/jpeg", "image/png", "image/webp"].includes(blob.type))
    return blob;
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare a photo for Facebook.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (converted) =>
          converted
            ? resolve(converted)
            : reject(new Error("Could not prepare a photo for Facebook.")),
        "image/jpeg",
        0.9,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function portablePhoto(
  source: string,
  index: number,
): Promise<PortablePhoto> {
  const response = await fetch(source);
  if (!response.ok) throw new Error("Could not prepare a photo for Facebook.");
  const blob = await facebookPhotoBlob(await response.blob());
  const extension =
    blob.type === "image/png"
      ? "png"
      : blob.type === "image/webp"
        ? "webp"
        : "jpg";
  return {
    name: `sellmate-photo-${index + 1}.${extension}`,
    type: blob.type || "image/jpeg",
    dataUrl: await readAsDataUrl(blob),
  };
}

/** Map SellMate condition values onto Facebook-friendly buckets. */
export function facebookCondition(condition: string): string {
  const value = condition
    .trim()
    .toLowerCase()
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ");
  if (!value) return "Good";
  if (/(^|\b)(new|brand new)(\b|$)/.test(value) && !/like new/.test(value))
    return "New";
  if (/excellent|like new|mint|as new|近全新/.test(value)) return "Excellent";
  if (/fair|poor|visible wear|seller described|satisfactory|尚可/.test(value))
    return "Fair";
  if (/good|light wear|very good|良好/.test(value)) return "Good";
  // Free-text / unknown → used-good so Marketplace can publish.
  return "Good";
}

/** Map SellMate categories onto Facebook-friendly browse buckets. */
export function facebookCategory(category: string): string {
  const value = category.trim().toLowerCase();
  if (!value) return "Other";
  if (/headphone|earbud|headset|audio|speaker/.test(value)) return "Headphones";
  if (/camera|photo|lens|fuji|canon|nikon/.test(value)) return "Cameras";
  if (/home|living|furniture|desk|table|chair|sofa|lamp|ikea/.test(value))
    return "Home & living";
  if (/electronic|phone|laptop|computer/.test(value)) return "Headphones";
  return "Other";
}

export async function openFacebookMarketplaceDraft(
  item: Item,
): Promise<string> {
  const listing = item.listings.facebook;
  if (
    !item.photos.length ||
    !listing.title.trim() ||
    !listing.description.trim()
  )
    throw new Error("Add photos and generate the Facebook draft first.");
  if (item.price <= 0) throw new Error("Choose an asking price first.");
  if (!item.condition.trim())
    throw new Error("Choose an item condition before publishing to Facebook.");

  const requestId = crypto.randomUUID();
  const draft: FacebookDraft = {
    requestId,
    itemId: item.id,
    title: listing.title,
    description: listing.description,
    price: item.price,
    category: facebookCategory(item.category),
    condition: facebookCondition(item.condition),
    delivery: item.delivery || "Local pickup",
    location: item.location,
    photos: await Promise.all(item.photos.map(portablePhoto)),
  };

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", receive);
      reject(
        new Error(
          "SellMate’s Facebook helper was not found. Load the extension from the browser-extension folder and try again.",
        ),
      );
    }, 3000);
    function receive(event: MessageEvent) {
      if (
        event.source !== window ||
        event.data?.type !== ACCEPTED ||
        event.data?.requestId !== requestId
      )
        return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
      if (event.data.ok) resolve();
      else
        reject(
          new Error(
            event.data.error || "The Facebook helper rejected this draft.",
          ),
        );
    }
    window.addEventListener("message", receive);
    window.postMessage({ type: REQUEST, draft }, window.location.origin);
  });
  return requestId;
}

export function subscribeToFacebookPublish(
  listener: (status: FacebookPublishStatus) => void,
): () => void {
  const receive = (event: MessageEvent) => {
    if (event.source !== window || event.data?.type !== STATUS) return;
    listener(event.data.status as FacebookPublishStatus);
  };
  window.addEventListener("message", receive);
  window.postMessage(
    { type: "SELLMATE_FACEBOOK_GET_STATUS" },
    window.location.origin,
  );
  return () => window.removeEventListener("message", receive);
}
