import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "browser-extension/facebook-fill.js",
  "utf8",
).replace("void run();", "");
function options(condition: string): string[] {
  return runInNewContext(`${source}\nconditionOptions(input)`, {
    input: condition,
  });
}
describe("Facebook condition selection", () => {
  it("maps seller conditions without upgrading used items to new", () => {
    expect(options("Excellent")).toContain("Used - Like New");
    expect(options("Excellent")).not.toContain("New");
    expect(options("used – good")).toContain("Used - Good");
    expect(options("Fair")).toContain("Used - Fair");
    expect(options("New")).toContain("New");
    expect(options("Seller described")).toEqual([]);
  });
  it.each([true, false])(
    "requires the condition control to reflect the selection (accepted: %s)",
    async (accepted) => {
      let time = 0;
      const result = await runInNewContext(
        `${source}
      class FakeElement {
        textContent = "Condition";
        getAttribute() { return null; }
        click() {}
      }
      HTMLElement = FakeElement;
      HTMLSelectElement = class extends FakeElement {};
      const control = new FakeElement();
      const option = new FakeElement();
      option.textContent = "Used – Like New";
      option.click = () => { if (accepted) control.textContent = "Condition Used – Like New"; };
      waitForControl = async () => control;
      findControl = () => control;
      dropdownRoot = () => ({ querySelectorAll: () => [option] });
      controlText = () => "Condition";
      visible = () => true;
      sleep = async () => {};
      selectDropdown(["condition"], conditionOptions("Excellent"), 100, 7000, true);
    `
          .replace("const sleep =", "let sleep =")
          .replace("const visible =", "let visible ="),
        {
          accepted,
          Date: { now: () => (time += 500) },
        },
      );
      expect(result).toBe(accepted);
    },
  );
});
