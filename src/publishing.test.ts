import { describe, expect, it, vi } from "vitest";
import { canPublish, publishBatch } from "./publishing";
import {
  changePrice,
  generateListings,
  markSold,
  parseState,
  seedState,
  type Item,
  type Platform,
} from "./model";

function fixture() {
  const state = seedState();
  const item = generateListings({
    ...state.items[0],
    status: "draft",
    listings: {
      ...state.items[0].listings,
      vinted: { ...state.items[0].listings.vinted, status: "draft" },
      facebook: { ...state.items[0].listings.facebook, status: "draft" },
    },
  });
  item.reviewed = true;
  return { item, connections: state.connections };
}
describe("multi-marketplace publishing", () => {
  it("publishes selected managed connections and reports each result", async () => {
    const { item, connections } = fixture();
    const publish = vi
      .fn()
      .mockResolvedValue({ publishedAt: "2026-09-19T00:00:00Z" });
    const report = vi.fn();
    const results = await publishBatch(
      item,
      ["offerup"],
      connections,
      { publish },
      report,
    );
    expect(publish.mock.calls.map((call) => call[1])).toEqual(["offerup"]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(report).toHaveBeenCalledTimes(1);
  });
  it("reports a managed failure and allows retry", async () => {
    const { item, connections } = fixture();
    const publish = vi
      .fn<
        (_item: Item, platform: Platform) => Promise<{ publishedAt: string }>
      >()
      .mockRejectedValueOnce(new Error("OfferUp unavailable"))
      .mockResolvedValue({ publishedAt: "2026-09-19T00:00:00Z" });
    await publishBatch(
      item,
      ["offerup"],
      connections,
      { publish },
      (result) => {
        item.listings[result.platform].status = result.ok ? "live" : "error";
      },
    );
    expect(item.listings.offerup.status).toBe("error");
    publish.mockClear();
    await publishBatch(item, ["offerup"], connections, { publish }, () => {});
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][1]).toBe("offerup");
  });
  it("requires a selection, valid drafts on every target, and active connections", () => {
    const { item, connections } = fixture();
    expect(canPublish(item, [], connections)).toBe(false);
    expect(
      canPublish(item, ["offerup"], { ...connections, offerup: false }),
    ).toBe(false);
    item.listings.offerup.description = "";
    expect(canPublish(item, ["offerup"], connections)).toBe(false);
    expect(canPublish(item, ["vinted"], connections)).toBe(false);
  });
  it("migrates legacy connection settings without losing items", () => {
    const state = seedState();
    const legacy = { ...state, connections: undefined, connected: false };
    const migrated = parseState(JSON.stringify(legacy))!;
    expect(migrated.connections).toEqual({
      vinted: false,
      offerup: true,
      facebook: false,
      mercari: false,
    });
    expect(migrated.items).toEqual(state.items);
  });
  it("tracks connected OfferUp listings through price changes and sold cleanup", () => {
    const item = seedState().items[0];
    item.listings.offerup = {
      ...item.listings.offerup,
      managed: true,
      status: "live",
    };
    expect(changePrice(item, 189).listings.offerup.price).toBe(189);
    expect(markSold(item, 189, "OfferUp").listings.offerup.status).toBe(
      "ended",
    );
    item.listings.offerup.managed = false;
    expect(markSold(item, 189, "OfferUp").listings.offerup.status).toBe(
      "needs-removal",
    );
  });
});
