import type { Item } from "./model";

const REQUEST = "SELLMATE_VINTED_PREPARE";
const ACCEPTED = "SELLMATE_VINTED_ACCEPTED";
const STATUS = "SELLMATE_VINTED_STATUS";

export type VintedPublishStatus = {
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

type VintedDraft = {
  requestId: string;
  itemId: string;
  brand: string;
  model: string;
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

async function vintedPhotoBlob(blob: Blob): Promise<Blob> {
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
    if (!context) throw new Error("Could not prepare a photo for Vinted.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (converted) =>
          converted
            ? resolve(converted)
            : reject(new Error("Could not prepare a photo for Vinted.")),
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
  if (!response.ok) throw new Error("Could not prepare a photo for Vinted.");
  const blob = await vintedPhotoBlob(await response.blob());
  const extension =
    blob.type === "image/png"
      ? "png"
      : blob.type === "image/webp"
        ? "webp"
        : "jpg";
  return {
    name: `sellmate-vinted-${index + 1}.${extension}`,
    type: blob.type || "image/jpeg",
    dataUrl: await readAsDataUrl(blob),
  };
}

export async function openVintedDraft(item: Item): Promise<string> {
  const listing = item.listings.vinted;
  if (
    !item.photos.length ||
    !listing.title.trim() ||
    !listing.description.trim()
  )
    throw new Error("Add photos and generate the Vinted draft first.");
  if (item.price <= 0) throw new Error("Choose an asking price first.");

  const requestId = crypto.randomUUID();
  const draft: VintedDraft = {
    requestId,
    itemId: item.id,
    brand: item.brand,
    model: item.model,
    title: listing.title,
    description: listing.description,
    price: item.price,
    category: item.category,
    condition: item.condition,
    delivery: item.delivery,
    location: item.location,
    photos: await Promise.all(item.photos.map(portablePhoto)),
  };

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", receive);
      reject(
        new Error(
          "SellMate’s Vinted helper was not found. Reload the unpacked extension and try again.",
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
            event.data.error || "The Vinted helper rejected this draft.",
          ),
        );
    }
    window.addEventListener("message", receive);
    window.postMessage({ type: REQUEST, draft }, window.location.origin);
  });
  return requestId;
}

export function subscribeToVintedPublish(
  listener: (status: VintedPublishStatus) => void,
): () => void {
  const receive = (event: MessageEvent) => {
    if (event.source !== window || event.data?.type !== STATUS) return;
    listener(event.data.status as VintedPublishStatus);
  };
  window.addEventListener("message", receive);
  window.postMessage(
    { type: "SELLMATE_VINTED_GET_STATUS" },
    window.location.origin,
  );
  return () => window.removeEventListener("message", receive);
}
