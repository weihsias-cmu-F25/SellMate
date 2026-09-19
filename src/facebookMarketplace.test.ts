import { describe, expect, it } from "vitest";
import { facebookCategory, facebookCondition } from "./facebookMarketplace";

describe("facebookCondition", () => {
  it("maps SellMate buckets for Marketplace", () => {
    expect(facebookCondition("Excellent")).toBe("Excellent");
    expect(facebookCondition("Good")).toBe("Good");
    expect(facebookCondition("Fair")).toBe("Fair");
    expect(facebookCondition("New")).toBe("New");
  });

  it("maps free-text and legacy values instead of leaving them blank", () => {
    expect(facebookCondition("Seller described")).toBe("Fair");
    expect(facebookCondition("Poor")).toBe("Fair");
    expect(facebookCondition("like new")).toBe("Excellent");
    expect(facebookCondition("light wear")).toBe("Good");
    expect(facebookCondition("")).toBe("Good");
    expect(facebookCondition("some random note")).toBe("Good");
  });
});

describe("facebookCategory", () => {
  it("maps app categories onto Facebook browse buckets", () => {
    expect(facebookCategory("Headphones")).toBe("Headphones");
    expect(facebookCategory("Cameras")).toBe("Cameras");
    expect(facebookCategory("Home & living")).toBe("Home & living");
    expect(facebookCategory("Other")).toBe("Other");
    expect(facebookCategory("IKEA desk")).toBe("Home & living");
    expect(facebookCategory("Sony earbuds")).toBe("Headphones");
  });
});
