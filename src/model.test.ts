import { describe, expect, it } from "vitest";
import {
  changePrice,
  generateListings,
  hasCleanup,
  markSold,
  needsReview,
  parseState,
  revise,
  seedState,
  validateListingUrl,
} from "./model";

describe("listing lifecycle", () => {
  it("updates the integrated price while retaining manual prices until confirmed", () => {
    const item = seedState().items[0];
    const updated = changePrice(item, 189);
    expect(updated.price).toBe(189);
    expect(updated.listings.ebay.price).toBe(189);
    expect(updated.listings.facebook.price).toBe(205);
    expect(needsReview(updated, 7)).toBe(false);
  });
  it("ends integrated listings and requires explicit cleanup for manual or unconfirmed listings", () => {
    const item = seedState().items[0];
    item.listings.offerup.status = "awaiting";
    const sold = markSold(item, 195, "Facebook Marketplace");
    expect(sold.status).toBe("sold");
    expect(sold.salePrice).toBe(195);
    expect(sold.listings.ebay.status).toBe("ended");
    expect(sold.listings.facebook.status).toBe("needs-removal");
    expect(sold.listings.offerup.status).toBe("needs-removal");
    expect(sold.listings.mercari.status).toBe("draft");
    expect(hasCleanup(sold)).toBe(true);
    expect(needsReview(sold, 7)).toBe(false);
  });
  it("invalidates research and unpublished drafts when facts change without overwriting live listings", () => {
    const item = seedState().items[0];
    const updated = revise(item, { condition: "Fair" });
    expect(updated.reviewed).toBe(false);
    expect(updated.research).toBeUndefined();
    expect(updated.listings.mercari.title).toBe("");
    expect(updated.listings.ebay).toEqual(item.listings.ebay);
    const generated = generateListings(updated);
    expect(generated.listings.mercari.description).toContain("fair");
    expect(generated.listings.ebay).toEqual(item.listings.ebay);
  });
  it("respects reminders being disabled and exact age boundaries", () => {
    const item = seedState().items[0],
      start = Date.parse(item.publishedAt!);
    expect(needsReview(item, 7, start + 7 * 86400000 - 1)).toBe(false);
    expect(needsReview(item, 7, start + 7 * 86400000)).toBe(true);
    expect(needsReview(item, 0, start + 90 * 86400000)).toBe(false);
  });
});
describe("browser persistence and listing URLs", () => {
  it("round-trips a complete workspace", () => {
    const state = seedState();
    expect(parseState(JSON.stringify(state))).toEqual(state);
  });
  it("rejects malformed or incompatible storage instead of crashing the UI", () => {
    expect(parseState("{broken")).toBeNull();
    expect(parseState('{"version":2}')).toBeNull();
    const state = seedState();
    (state.items[0] as unknown as { listings: unknown }).listings = null;
    expect(parseState(JSON.stringify(state))).toBeNull();
  });
  it("accepts only HTTPS links from the chosen marketplace", () => {
    expect(
      validateListingUrl(
        "https://www.facebook.com/marketplace/item/123",
        "facebook",
      ),
    ).toBe("https://www.facebook.com/marketplace/item/123");
    for (const url of [
      "javascript:alert(1)",
      "http://facebook.com/item",
      "https://facebook.com.attacker.test/item",
      "https://evilfacebook.com/item",
      "https://user:password@facebook.com/item",
    ])
      expect(validateListingUrl(url, "facebook")).toBeNull();
    expect(
      validateListingUrl("https://www.ebay.com/itm/123", "facebook"),
    ).toBeNull();
  });
});
