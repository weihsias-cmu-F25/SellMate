import { describe, expect, it } from "vitest";
import {
  answerDetail,
  editDetail,
  nextDetailQuestion,
} from "./detailQuestions";
import { blankItem, parseState, seedState } from "./model";

describe("adaptive detail conversation", () => {
  it("skips known identity and asks one missing detail", () => {
    const camera = seedState().items[1];
    expect(nextDetailQuestion(camera)?.field).toBe("purchased");
  });
  it("asks about damage only when needed", () => {
    const item = {
      ...seedState().items[0],
      damage: "",
      condition: "Excellent",
    };
    expect(nextDetailQuestion(item)).toBeNull();
    expect(nextDetailQuestion({ ...item, condition: "Fair" })?.field).toBe(
      "damage",
    );
    expect(
      nextDetailQuestion({ ...item, functional: "Not fully working" })?.field,
    ).toBe("damage");
  });
  it("tailors follow-ups to the category", () => {
    const item = { ...seedState().items[0], functional: "" };
    expect(nextDetailQuestion(item)?.text).toContain("both sides");
    expect(
      nextDetailQuestion({ ...item, category: "Cameras" })?.text,
    ).toContain("take photos");
    expect(
      nextDetailQuestion({
        ...item,
        category: "Cameras",
        functional: "Yes",
        accessories: "",
      })?.text,
    ).toContain("lens");
  });
  it("preserves custom descriptions without pretending to infer their condition", () => {
    const item = { ...seedState().items[0], condition: "" };
    const question = nextDetailQuestion(item)!;
    const answered = answerDetail(item, question, "A scratch on the side");
    expect(answered.damage).toBe("A scratch on the side");
    expect(answered.condition).toBe("Seller described");
    expect(answered.detailReplies?.[0].answer).toBe("A scratch on the side");
    expect(answered.reviewed).toBe(false);
  });
  it("remembers answers and resumes after a reload, including uncertainty", () => {
    const state = seedState();
    let item = { ...blankItem(), brand: "Sony", model: "XM5", sample: true };
    item = answerDetail(
      item,
      nextDetailQuestion(item)!,
      "Not sure",
      "Not sure",
    );
    state.items = [item];
    const restored = parseState(JSON.stringify(state))!;
    expect(nextDetailQuestion(restored.items[0])?.field).toBe("condition");
    expect(restored.items[0].detailReplies?.[0].answer).toBe("Not sure");
  });
  it("re-asks category-dependent questions when the category is corrected", () => {
    const item = editDetail(seedState().items[0], "category");
    expect(nextDetailQuestion(item)?.field).toBe("category");
    const corrected = answerDetail(
      item,
      nextDetailQuestion(item)!,
      "Cameras",
      "Cameras",
    );
    expect(nextDetailQuestion(corrected)?.text).toContain("take photos");
    expect(corrected.accessories).toBe("");
    expect(corrected.purchased).toBe("2024-11");
  });
});
