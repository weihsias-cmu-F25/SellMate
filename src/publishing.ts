import {
  INTEGRATED_PLATFORMS,
  platformNames,
  type Connections,
  type Item,
  type Platform,
} from "./model";
import type { SellingService } from "./services";

export type PublishResult =
  | { platform: Platform; ok: true; publishedAt: string }
  | { platform: Platform; ok: false; error: string };
export function selectedPlatforms(
  item: Item,
  connections: Connections,
): Platform[] {
  return (
    item.publishTargets ?? INTEGRATED_PLATFORMS.filter((p) => connections[p])
  );
}
export function canPublish(
  item: Item,
  targets: Platform[],
  connections: Connections,
): boolean {
  const pending = targets.filter((p) => item.listings[p].status !== "live");
  return (
    item.status !== "sold" &&
    item.reviewed &&
    item.photos.length > 0 &&
    item.price > 0 &&
    !!item.location.trim() &&
    pending.length > 0 &&
    pending.every(
      (p) =>
        INTEGRATED_PLATFORMS.includes(p) &&
        connections[p] &&
        !!item.listings[p].title.trim() &&
        !!item.listings[p].description.trim() &&
        item.listings[p].price === item.price,
    )
  );
}
/** Settle each destination independently. Previously live listings are never submitted again. */
export async function publishBatch(
  item: Item,
  targets: Platform[],
  connections: Connections,
  service: Pick<SellingService, "publish">,
  onResult: (result: PublishResult) => void,
  signal?: AbortSignal,
): Promise<PublishResult[]> {
  const pending = [...new Set(targets)].filter(
    (p) => item.listings[p].status !== "live",
  );
  if (!canPublish(item, pending, connections))
    throw new Error(
      "Select connected marketplaces and review all selected drafts before publishing.",
    );
  return Promise.all(
    pending.map(async (platform) => {
      let result: PublishResult;
      try {
        const response = await service.publish(item, platform, signal);
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        result = { platform, ok: true, publishedAt: response.publishedAt };
      } catch (error) {
        if (signal?.aborted) throw error;
        result = {
          platform,
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : `${platformNames[platform]} publishing failed. Please retry.`,
        };
      }
      onResult(result);
      return result;
    }),
  );
}
