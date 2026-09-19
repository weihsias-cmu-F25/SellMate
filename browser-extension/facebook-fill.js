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
        current.getAttribute("aria-label"),
        current.textContent,
        controlText(current),
      ]
        .filter(Boolean)
        .join(" "),
    );
    return wanted.some(
      (alias) => text.includes(alias) || ` ${text} `.includes(` ${alias} `),
    );
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
          (value) =>
            text === value ||
            text.startsWith(`${value} `) ||
            (value.includes(" ") || value.includes("-") || value.length > 4
              ? text.includes(value)
              : false),
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

function categoryLevels(category) {
  const value = normalize(category);
  if (
    value.includes("headphone") ||
    value.includes("earbud") ||
    value.includes("audio") ||
    value.includes("speaker")
  ) {
    return [
      [
        "Electronics",
        "Electronics & computers",
        "Electronics and computers",
        "電子產品",
        "電子產品與電腦",
      ],
      ["Headphones", "Audio & headphones", "Audio", "Headsets", "耳機"],
    ];
  }
  if (
    value.includes("camera") ||
    value.includes("photo") ||
    value.includes("lens")
  ) {
    return [
      [
        "Electronics",
        "Electronics & computers",
        "Electronics and computers",
        "電子產品",
        "電子產品與電腦",
      ],
      [
        "Cameras",
        "Cameras & photo",
        "Photo & video",
        "Photography",
        "相機",
      ],
    ];
  }
  if (
    value.includes("electronic") ||
    value.includes("phone") ||
    value.includes("computer") ||
    value.includes("laptop")
  ) {
    return [
      [
        "Electronics",
        "Electronics & computers",
        "Electronics and computers",
        "電子產品",
        "電子產品與電腦",
      ],
    ];
  }
  if (
    value.includes("home") ||
    value.includes("living") ||
    value.includes("furniture") ||
    value.includes("desk") ||
    value.includes("table") ||
    value.includes("chair") ||
    value.includes("sofa")
  ) {
    return [
      [
        "Furniture",
        "Household",
        "Home Goods",
        "Home & Garden",
        "Home & Kitchen",
        "Home",
        "家居用品",
        "居家與園藝",
        "家具",
      ],
    ];
  }
  return [["Miscellaneous", "Other", "其他", "Misc"]];
}

function categoryOptions(category) {
  return categoryLevels(category).flat();
}

async function clickMatchingOption(optionAliases) {
  const wanted = optionAliases.map(normalize);
  const root = dropdownRoot();
  const option = [
    ...root.querySelectorAll(
      '[role="option"], [role="menuitem"], [role="menuitemradio"], [role="radio"], [role="button"], [role="listitem"], li, span, div',
    ),
  ]
    .filter(visible)
    .find((candidate) => {
      const text = dropdownOptionText(candidate);
      if (!text || text.length > 80) return false;
      return wanted.some(
        (value) =>
          text === value ||
          text.startsWith(`${value} `) ||
          (value.includes(" ") || value.includes("-") || value.length > 4
            ? text.includes(value)
            : false),
      );
    });
  if (!(option instanceof HTMLElement)) return false;
  option.click();
  await sleep(350);
  return true;
}

async function selectCategory(category) {
  const levels = categoryLevels(category);
  const primary = levels[0] || ["Miscellaneous", "Other", "其他"];

  // Prefer the dedicated category control, then try search-assisted pick.
  const control = await waitForControl(
    'select, [role="combobox"], [role="button"], button, input',
    ["category", "類別", "what are you selling", "商品類別"],
    15000,
  );
  if (control instanceof HTMLElement) {
    const already = normalize(
      [
        control.getAttribute("aria-valuetext"),
        control.textContent,
        control instanceof HTMLInputElement ? control.value : "",
        controlText(control),
      ]
        .filter(Boolean)
        .join(" "),
    );
    if (primary.some((alias) => already.includes(normalize(alias))))
      return true;

    control.click();
    await sleep(450);

    const root = dropdownRoot();
    const search = [
      ...root.querySelectorAll(
        'input[type="text"], input[type="search"], input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])',
      ),
    ].find(
      (element) =>
        element instanceof HTMLInputElement &&
        visible(element) &&
        !element.readOnly,
    );
    if (search instanceof HTMLInputElement) {
      setNativeValue(search, primary[0]);
      await sleep(500);
    }

    if (await clickMatchingOption(primary)) {
      await sleep(400);
      if (levels[1]?.length) {
        // Subcategory is optional — do not fail the listing if it is absent.
        await clickMatchingOption(levels[1]);
        await sleep(300);
      }
      return true;
    }
  }

  let selected =
    (await selectDropdown(
      ["category", "類別", "what are you selling", "商品類別"],
      primary,
      12000,
      8000,
      false,
    )) ||
    (await selectDropdown(
      ["category", "類別", "what are you selling", "商品類別"],
      categoryOptions(category),
      8000,
      8000,
      false,
    ));

  if (!selected) {
    selected = await selectDropdown(
      ["category", "類別", "what are you selling", "商品類別"],
      ["Miscellaneous", "Other", "其他", "Furniture", "Electronics"],
      8000,
      8000,
      false,
    );
  }
  return !!selected;
}

function conditionOptions(condition) {
  const value = normalize(condition).replace(/^used\s*-\s*/, "");
  if (
    ["excellent", "like new", "近全新", "mint", "as new"].includes(value) ||
    value.includes("like new")
  )
    return ["Used - Like New", "Like New", "二手 - 近全新", "近全新"];
  if (
    ["good", "良好", "狀況良好", "light wear", "very good"].includes(value) ||
    value.includes("light wear")
  )
    return ["Used - Good", "Good", "二手 - 良好", "狀況良好", "良好"];
  if (
    [
      "fair",
      "尚可",
      "poor",
      "visible wear",
      "seller described",
      "acceptable",
    ].includes(value) ||
    value.includes("seller described") ||
    value.includes("visible wear")
  )
    return ["Used - Fair", "Fair", "二手 - 尚可", "尚可"];
  if (["new", "brand new", "全新"].includes(value))
    return ["New", "Brand New", "全新"];
  // Never return empty — Facebook requires a condition to publish.
  return ["Used - Good", "Good", "二手 - 良好", "狀況良好", "良好"];
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
    const category = await selectCategory(draft.category);
    if (!category)
      throw new Error(
        "Facebook’s Category field could not be set. Open the Marketplace tab, choose a category manually, then try again from SellMate.",
      );
    const conditionChoices = conditionOptions(draft.condition);
    let condition =
      conditionChoices.length > 0 &&
      (await selectDropdown(
        ["condition", "item condition", "商品狀況", "狀況"],
        conditionChoices,
        15000,
        7000,
        true,
      ));
    // Facebook sometimes keeps the control label as "Condition" after a
    // successful pick. Retry once without strict verification.
    if (!condition && conditionChoices.length) {
      condition = await selectDropdown(
        ["condition", "item condition", "商品狀況", "狀況"],
        conditionChoices,
        8000,
        7000,
        false,
      );
    }
    if (!condition)
      throw new Error(
        "Facebook’s Condition field could not be set. Open the Marketplace tab, choose a condition manually, then try again from SellMate.",
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
