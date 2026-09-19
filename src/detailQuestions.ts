import { revise, type DetailField, type Item } from "./model";

export interface DetailQuestion {
  field: DetailField;
  text: string;
  hint?: string;
  placeholder: string;
  choices?: { label: string; value: string }[];
}
const choices = (...values: string[]) =>
  values.map((value) => ({ label: value, value }));

/** Local demo question policy. Replace with your agent's structured next-question response. */
export function nextDetailQuestion(item: Item): DetailQuestion | null {
  if (!item.brand.trim())
    return {
      field: "brand",
      text: "What brand is it?",
      placeholder: "e.g. Sony, Canon, IKEA…",
      choices: choices("Unbranded"),
    };
  if (!item.model.trim())
    return {
      field: "model",
      text: `What’s the model of your ${item.brand} item?`,
      hint: "You might find it on a label on the back or underneath.",
      placeholder: "e.g. WH-1000XM5",
      choices: choices("Not sure"),
    };
  if (
    !item.category ||
    (!item.sample &&
      !(item.detailReplies || []).some((r) => r.field === "category"))
  )
    return {
      field: "category",
      text: "What kind of item are we selling?",
      placeholder: "Or describe what it is…",
      choices: choices("Headphones", "Cameras", "Home & living", "Other"),
    };
  if (!item.purchased)
    return {
      field: "purchased",
      text: "About how long have you had it?",
      hint: "An estimate is completely fine.",
      placeholder: "e.g. Bought it in November 2024",
      choices: choices("Under a year", "1–2 years", "Over 2 years", "Not sure"),
    };
  if (!item.condition)
    return {
      field: "condition",
      text: "How’s it looking? Any wear or damage?",
      placeholder: "e.g. A small scratch on the left ear cup…",
      choices: [
        { label: "Like new", value: "Excellent" },
        { label: "Light wear", value: "Good" },
        { label: "Visible damage", value: "Fair" },
      ],
    };
  if (!item.functional)
    return {
      field: "functional",
      text:
        item.category === "Headphones"
          ? "Do both sides, charging, and the controls work?"
          : item.category === "Cameras"
            ? "Does it take photos and charge normally?"
            : "Does everything work as it should?",
      placeholder: "Or tell me what you’ve noticed…",
      choices: [
        { label: "Yes, all working", value: "Yes" },
        { label: "There’s an issue", value: "Not fully working" },
        { label: "Not sure", value: "Not sure" },
      ],
    };
  if (
    (["Good", "Fair"].includes(item.condition) ||
      item.functional === "Not fully working") &&
    !item.damage
  )
    return {
      field: "damage",
      text:
        item.functional === "Not fully working"
          ? "What’s the issue a buyer should know about?"
          : "Could you tell me a little about the wear?",
      hint: "A short description is all I need.",
      placeholder:
        item.category === "Cameras"
          ? "e.g. A scratch on the screen; photos look normal…"
          : "e.g. A small scratch, but everything works…",
      choices: choices("Not sure how to describe it"),
    };
  if (!item.accessories)
    return {
      field: "accessories",
      text:
        item.category === "Headphones"
          ? "Do you still have the original case or cable?"
          : item.category === "Cameras"
            ? "What’s included—lens, battery, or charger?"
            : "Anything else included with it?",
      placeholder: "Or list exactly what’s included…",
      choices:
        item.category === "Headphones"
          ? choices("Case + cable", "Case only", "Headphones only", "Not sure")
          : item.category === "Cameras"
            ? choices(
                "Lens, battery + charger",
                "Body, battery + charger",
                "Camera body only",
                "Not sure",
              )
            : choices("Everything it came with", "Just the item", "Not sure"),
    };
  return null;
}

export function answerDetail(
  item: Item,
  question: DetailQuestion,
  answer: string,
  choiceValue?: string,
): Item {
  const text = answer.trim();
  if (!text) return item;
  const value = choiceValue ?? text;
  const patch: Partial<Item> = { [question.field]: value };
  // Keep custom descriptions verbatim; don't invent a condition classification.
  if (question.field === "condition" && !choiceValue) {
    patch.condition = "Seller described";
    patch.damage = text;
  }
  if (
    question.field === "category" &&
    !["Headphones", "Cameras", "Home & living", "Other"].includes(value)
  )
    patch.category = "Other";
  return revise(item, {
    ...patch,
    detailReplies: [
      ...(item.detailReplies || []).filter((r) => r.field !== question.field),
      { field: question.field, question: question.text, answer: text },
    ],
  });
}

export function editDetail(item: Item, field: DetailField): Item {
  const clear: DetailField[] =
    field === "category"
      ? ["category", "functional", "damage", "accessories"]
      : field === "condition"
        ? ["condition", "damage"]
        : [field];
  return revise(item, {
    ...Object.fromEntries(clear.map((key) => [key, ""])),
    detailReplies: (item.detailReplies || []).filter(
      (r) => !clear.includes(r.field),
    ),
  });
}
