const DRAFT_KEY = "sellmateFacebookDraft";
const STATUS_KEY = "sellmateFacebookStatus";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
const visible = (element) =>
  element instanceof HTMLElement &&
  element.getBoundingClientRect().width > 0 &&
  element.getBoundingClientRect().height > 0;

async function setStatus(draft, state, message, url) {
  console.info("[SellMate Facebook] Status", {
    requestId: draft.requestId,
    state,
    message,
    ...(url ? { url } : {}),
  });
  await chrome.storage.local.set({
    [STATUS_KEY]: {
      requestId: draft.requestId,
      itemId: draft.itemId,
      state,
      message,
      ...(url ? { url } : {}),
    },
  });
}

function controlText(element) {
  const label =
    element.id &&
    document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
  const labelledBy = (element.getAttribute("aria-labelledby") || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent)
    .filter(Boolean);
  const nearby = element.closest("label, [role=group]");
  return normalize(
    [
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder"),
      ...labelledBy,
      label?.textContent,
      nearby?.textContent?.slice(0, 160),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function findControl(selector, aliases) {
  const normalized = aliases.map(normalize);
  const direct = [...document.querySelectorAll(selector)]
    .filter(visible)
    .map((element) => ({
      element,
      text: controlText(element),
    }))
    .filter(({ text }) => normalized.some((alias) => text.includes(alias)))
    .sort((a, b) => a.text.length - b.text.length)[0]?.element;
  if (direct) return direct;

  const root = document.querySelector('[role="main"]') || document;
  const label = [...root.querySelectorAll("label, span, div")]
    .filter(visible)
    .find((element) => normalized.includes(normalize(element.textContent)));
  let container = label?.parentElement;
  for (let depth = 0; container && depth < 5; depth += 1) {
    const nearby = [...container.querySelectorAll(selector)].find(
      (element) => visible(element) && element !== label,
    );
    if (nearby) return nearby;
    container = container.parentElement;
  }
  return null;
}

function dropdownRoot() {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(
    visible,
  );
  return (
    dialogs
      .filter((dialog) =>
        normalize(dialog.getAttribute("aria-label")).includes("dropdown"),
      )
      .at(-1) ||
    dialogs
      .filter((dialog) =>
        dialog.querySelector(
          '[role="option"], [role="menuitem"], [role="menuitemradio"], [role="radio"], [role="button"]',
        ),
      )
      .at(-1) ||
    document
  );
}

function dropdownOptionText(element) {
  const text = normalize(element.textContent);
  return text
    .replace(/\s*shipping available\s*$/, "")
    .replace(/\s*可提供運送\s*$/, "")
    .trim();
}

function setNativeValue(element, value) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, String(value));
  element.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText" }),
  );
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

async function waitForControl(selector, aliases, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const control = findControl(selector, aliases);
    if (control) return control;
    await sleep(300);
  }
  return null;
}

async function fillText(selector, aliases, value) {
  if (!value) return false;
  const control = await waitForControl(selector, aliases);
  if (!(
    control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement
  ))
    return false;
  control.focus();
  setNativeValue(control, value);
  return true;
}

async function selectDropdown(
  fieldAliases,
  optionAliases,
  controlTimeout = 7000,
  optionTimeout = 7000,
  verifySelection = false,
) {
  const selector = 'select, [role="combobox"], [role="button"], button';
  const control = await waitForControl(selector, fieldAliases, controlTimeout);
  if (!(control instanceof HTMLElement)) return false;
  const wanted = optionAliases.map(normalize);
  const matches = (value) =>
    wanted.some((alias) => {
      const text = normalize(value);
      return text === alias || text.startsWith(`${alias} `);
    });
  const selected = () => {
    const current = findControl(selector, fieldAliases) || control;
    if (current instanceof HTMLSelectElement)
      return matches(current.selectedOptions[0]?.textContent);
    const text = normalize(
      [
        current.getAttribute("aria-valuetext"),
        current.textContent,
        controlText(current),
      ]
        .filter(Boolean)
        .join(" "),
    );
    return wanted.some((alias) => ` ${text} `.includes(` ${alias} `));
  };
  if (verifySelection && selected()) return true;
  if (control instanceof HTMLSelectElement) {
    const option = [...control.options].find((option) =>
      matches(option.textContent),
    );
    if (!option) return false;
    control.value = option.value;
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(350);
    return selected();
  }
  control.click();
  const started = Date.now();
  while (Date.now() - started < optionTimeout) {
    const root = dropdownRoot();
    const option = [
      ...root.querySelectorAll(
        '[role="option"], [role="menuitem"], [role="menuitemradio"], [role="radio"], [role="button"]',
      ),
    ]
      .filter(visible)
      .find((candidate) => {
        const text = dropdownOptionText(candidate);
        return wanted.some(
          (value) => text === value || text.startsWith(`${value} `),
        );
      });
    if (option instanceof HTMLElement) {
      option.click();
      await sleep(350);
      if (!verifySelection) return true;
      const confirmationStarted = Date.now();
      while (Date.now() - confirmationStarted < 3000) {
        if (selected()) return true;
        await sleep(200);
      }
      return false;
    }
    await sleep(250);
  }
  return false;
}

function categoryOptions(category) {
  if (category === "Headphones" || category === "Cameras")
    return [
      "Electronics & computers",
      "Electronics and computers",
      "Electronics",
      "電子產品",
      "電子產品與電腦",
    ];
  if (category === "Home & living")
    return [
      "Household",
      "Furniture",
      "Garden",
      "Appliances",
      "Home Goods",
      "Home & Garden",
      "家居用品",
      "居家與園藝",
    ];
  return ["Miscellaneous", "Other", "其他"];
}

function conditionOptions(condition) {
  const value = normalize(condition).replace(/^used\s*-\s*/, "");
  if (["excellent", "like new", "近全新"].includes(value))
    return ["Used - Like New", "Like New", "二手 - 近全新", "近全新"];
  if (["good", "良好", "狀況良好"].includes(value))
    return ["Used - Good", "Good", "二手 - 良好", "狀況良好", "良好"];
  if (["fair", "尚可"].includes(value))
    return ["Used - Fair", "Fair", "二手 - 尚可", "尚可"];
  if (["new", "brand new", "全新"].includes(value))
    return ["New", "Brand New", "全新"];
  return [];
}

function deliveryOptions(delivery) {
  if (delivery === "Local pickup")
    return ["Local pickup", "Local meetup", "Pickup", "本地取貨", "當面取貨"];
  return [
    "Shipping",
    "Offer shipping",
    "Shipping and local pickup",
    "運送",
    "提供運送服務",
  ];
}

async function uploadPhotos(photos) {
  const started = Date.now();
  let input = null;
  while (Date.now() - started < 15000) {
    input = [...document.querySelectorAll('input[type="file"]')].find(
      (candidate) =>
        candidate instanceof HTMLInputElement &&
        (candidate.accept.includes("image") || candidate.multiple),
    );
    if (input) break;
    await sleep(300);
  }
  if (!(input instanceof HTMLInputElement)) return false;
  const transfer = new DataTransfer();
  for (const photo of photos) {
    const blob = await fetch(photo.dataUrl).then((response) => response.blob());
    transfer.items.add(
      new File([blob], photo.name, {
        type: photo.type || blob.type || "image/jpeg",
      }),
    );
  }
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function findSubmitAction() {
  const root = document.querySelector('[role="main"]') || document;
  const labels = new Set(["publish", "next", "發佈", "發布", "下一步"]);
  const actions = [...root.querySelectorAll('button, [role="button"]')]
    .filter(visible)
    .filter((element) => labels.has(normalize(element.textContent)));
  return (
    actions.find((element) =>
      ["publish", "發佈", "發布"].includes(normalize(element.textContent)),
    ) || actions[0]
  );
}

async function submitListing(draft) {
  for (let step = 0; step < 4; step += 1) {
    await selectDropdown(
      ["availability", "供貨情況"],
      ["List as single item", "Single item", "刊登單件商品"],
      50,
      2500,
    );
    await selectDropdown(
      ["delivery method", "delivery", "運送方式", "配送方式"],
      deliveryOptions(draft.delivery),
      50,
      2500,
    );
    const started = Date.now();
    let action = null;
    while (Date.now() - started < 12000) {
      action = findSubmitAction();
      if (action) break;
      await sleep(300);
    }
    if (!(action instanceof HTMLElement))
      throw new Error("Facebook’s Next or Publish control was not found.");
    if (
      action.getAttribute("aria-disabled") === "true" ||
      action.hasAttribute("disabled")
    )
      throw new Error(
        "Facebook requires another field before this listing can be submitted.",
      );

    const label = normalize(action.textContent);
    const publishing = ["publish", "發佈", "發布"].includes(label);
    if (publishing)
      await setStatus(
        draft,
        "submitting",
        "Facebook Publish was submitted; waiting for the listing URL.",
      );
    action.click();
    if (publishing) return;
    await sleep(1200);
  }
  throw new Error("Facebook did not reach its Publish step.");
}

async function captureListingUrl(draft) {
  if (!/^\/marketplace\/item\/[^/]+/.test(window.location.pathname))
    return false;
  await setStatus(
    draft,
    "live",
    "Facebook listing URL captured.",
    window.location.href,
  );
  await chrome.storage.local.remove(DRAFT_KEY);
  return true;
}

function watchForPublishedListing(draft) {
  const timer = window.setInterval(() => {
    void captureListingUrl(draft).then((captured) => {
      if (captured) window.clearInterval(timer);
    });
  }, 1000);
}

async function run() {
  const stored = await chrome.storage.local.get(DRAFT_KEY);
  const draft = stored[DRAFT_KEY];
  if (!draft) {
    console.info("[SellMate Facebook] No pending draft found");
    return;
  }
  console.info("[SellMate Facebook] Starting Marketplace form", {
    requestId: draft.requestId,
    itemId: draft.itemId,
  });

  if (await captureListingUrl(draft)) return;
  if (!window.location.pathname.startsWith("/marketplace/create/")) return;

  watchForPublishedListing(draft);
  try {
    const textResults = await Promise.all([
      uploadPhotos(draft.photos),
      fillText('input:not([type="file"])', ["title", "標題"], draft.title),
      fillText('input:not([type="file"])', ["price", "價格"], draft.price),
      fillText("textarea", ["description", "說明", "描述"], draft.description),
      fillText(
        'input:not([type="file"])',
        ["location", "地點", "位置"],
        draft.location,
      ),
    ]);
    const category = await selectDropdown(
      ["category", "類別"],
      categoryOptions(draft.category),
    );
    const conditionChoices = conditionOptions(draft.condition);
    const condition =
      conditionChoices.length > 0 &&
      (await selectDropdown(
        ["condition", "item condition", "商品狀況", "狀況"],
        conditionChoices,
        15000,
        7000,
        true,
      ));
    if (!condition)
      throw new Error(
        conditionChoices.length
          ? "Facebook’s Condition field could not be confirmed. Select the matching condition in Facebook before continuing. Nothing was published."
          : "Choose a specific item condition in SellMate before publishing to Facebook.",
      );
    const required = [...textResults.slice(0, 4), category, condition];
    console.info("[SellMate Facebook] Field results", {
      photos: textResults[0],
      title: textResults[1],
      price: textResults[2],
      description: textResults[3],
      location: textResults[4],
      category,
      condition,
    });
    if (required.some((result) => !result))
      throw new Error(
        "Facebook changed or rejected a required listing field. Nothing was published.",
      );

    const completed = textResults.filter(Boolean).length + 2;
    await setStatus(
      draft,
      "filled",
      `${completed} Facebook fields filled. Submitting the reviewed listing.`,
    );
    await submitListing(draft);
  } catch (error) {
    console.error("[SellMate Facebook] Marketplace automation failed", error);
    const message =
      error instanceof Error
        ? error.message
        : "Facebook’s form could not be filled.";
    await setStatus(draft, "error", message);
  }
}

void run();
