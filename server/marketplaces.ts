export type PlatformId = "ebay" | "offerup" | "facebook" | "mercari";

export interface PublishResult {
  publishedAt: string;
  externalId: string;
  url: string;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const prefixes: Record<PlatformId, string> = {
  ebay: "https://www.ebay.com/itm",
  offerup: "https://offerup.com/item/detail",
  facebook: "https://facebook.com/marketplace/item",
  mercari: "https://www.mercari.com/us/item",
};

/** Mock marketplace adapters — real OAuth/APIs are out of MVP scope. */
export async function mockPublish(
  platform: PlatformId,
  _title: string,
): Promise<PublishResult> {
  await delay(platform === "offerup" ? 900 : 500);
  const externalId = `${platform}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    publishedAt: new Date().toISOString(),
    externalId,
    url: `${prefixes[platform]}/${externalId}`,
  };
}

export async function mockClose(_platform: PlatformId): Promise<void> {
  await delay(400);
}

export async function mockUpdatePrice(
  _platform: PlatformId,
  _price: number,
): Promise<void> {
  await delay(350);
}
