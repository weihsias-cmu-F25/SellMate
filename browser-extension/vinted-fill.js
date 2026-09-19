const DRAFT_KEY = "sellmateVintedDraft";
const STATUS_KEY = "sellmateVintedStatus";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const visible = (element) =>
  element instanceof HTMLElement &&
  !element.closest('[aria-hidden="true"], #onetrust-consent-sdk, header') &&
  element.getBoundingClientRect().width > 0 &&
  element.getBoundingClientRect().height > 0;

async function setStatus(draft, state, message, url) {
  console.info("[SellMate Vinted] Status", {
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

function byTestId(id) {
  return document.querySelector(`[data-testid="${id}"]`);
}

function needsSignIn() {
  const path = window.location.pathname;
  return (
    path.includes("/member/signup") ||
    path.includes("/member/login") ||
    path.includes("/users/login")
  );
}

async function dismissConsent() {
  const allow = [...document.querySelectorAll("button")].find(
    (button) =>
      visible(button) && normalize(button.textContent) === "allow all",
  );
  if (allow instanceof HTMLElement) allow.click();
}

async function fillByTestId(id, value) {
  if (value === undefined || value === null || value === "") return false;
  const control = byTestId(id);
  if (!(
    control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement
  ))
    return false;
  if (normalize(control.value) === normalize(value)) return true;
  control.focus();
  setNativeValue(control, value);
  return normalize(control.value) === normalize(value) || !!control.value;
}

async function uploadPhotos(photos) {
  const grid = byTestId("media-upload-grid");
  if (grid && grid.querySelector("img, [class*='thumbnail'], [class*='photo']"))
    return true;

  const input = byTestId("add-photos-input");
  if (!(input instanceof HTMLInputElement)) return false;
  if (input.files?.length) {
    return !!(
      grid && grid.querySelector("img, [class*='thumbnail'], [class*='photo']")
    );
  }

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
  console.info("[SellMate Vinted] Photo upload started", {
    count: transfer.files.length,
  });
  return false;
}

function categoryLevels(draft) {
  if (draft.category === "Headphones")
    return [
      ["Electronics"],
      ["Headphones", "Audio", "Earphones", "Music & instruments"],
    ];
  if (draft.category === "Cameras")
    return [
      ["Electronics"],
      ["Cameras", "Photography", "Video cameras", "Camera accessories"],
    ];
  if (draft.category === "Home & living")
    return [
      ["Home"],
      ["Home accessories", "Decoration", "Other home", "Living room", "Other"],
    ];
  return [
    ["Hobbies & collectibles", "Electronics"],
    ["Other", "Other hobbies"],
  ];
}

function conditionOptions(condition) {
  if (condition === "Excellent")
    return ["Very good", "New without tags", "New with tags"];
  if (condition === "Good") return ["Good", "Very good"];
  if (condition === "Fair" || condition === "Seller described")
    return ["Satisfactory", "Good"];
  return ["Good"];
}

function brandOptions(draft) {
  const brand = String(draft.brand || "").trim();
  if (
    !brand ||
    normalize(brand) === "not sure" ||
    normalize(brand) === "unbranded"
  )
    return ["No brand", "Unbranded", "Other"];
  return [brand, "Other", "No brand"];
}

function catalogRoot() {
  const dialogs = [
    ...document.querySelectorAll(
      '[role="listbox"], [role="menu"], [role="dialog"], [class*="dropdown"], [class*="catalog"]',
    ),
  ].filter(
    (element) =>
      visible(element) &&
      !element.closest("header, #onetrust-consent-sdk") &&
      element.querySelector(
        '[role="option"], [role="menuitem"], li, button, a',
      ),
  );
  return dialogs.at(-1) || null;
}

function optionCandidates(root = document) {
  return [
    ...root.querySelectorAll(
      '[role="option"], [role="menuitem"], [role="listitem"], li, button, a, [role="button"]',
    ),
  ].filter(
    (element) =>
      visible(element) &&
      !element.closest("header, #onetrust-consent-sdk") &&
      !element.matches('[data-testid^="first-category-"]') &&
      !element.closest('[data-testid^="first-category-"]'),
  );
}

async function chooseVisibleOption(aliases, root) {
  const wanted = aliases.map(normalize);
  const options = optionCandidates(root || catalogRoot() || document);
  const option = options.find((candidate) => {
    const text = normalize(candidate.textContent);
    return wanted.some(
      (value) => text === value || text.startsWith(`${value} `),
    );
  });
  if (!(option instanceof HTMLElement)) return false;
  console.info("[SellMate Vinted] Selecting option", {
    value: normalize(option.textContent),
  });
  option.click();
  await sleep(250);
  return true;
}

async function selectCategory(draft) {
  const input = byTestId("catalog-select-dropdown-input");
  if (!(input instanceof HTMLInputElement)) return false;
  if (input.value.trim()) return true;

  input.click();
  await sleep(200);
  for (const aliases of categoryLevels(draft)) {
    const root = catalogRoot();
    const search = [
      ...(root || document).querySelectorAll(
        'input[type="text"]:not([readonly]), input[type="search"]',
      ),
    ].find(visible);
    if (search instanceof HTMLInputElement && !search.value) {
      setNativeValue(search, aliases[0]);
      await sleep(250);
    }
    if (!(await chooseVisibleOption(aliases, root || undefined))) return false;
    await sleep(250);
  }
  return !!input.value.trim();
}

function fieldInput(label) {
  const htmlFor = label.getAttribute("for");
  return (
    (htmlFor && document.getElementById(htmlFor)) ||
    label.querySelector("input, textarea, select")
  );
}

function emptyRequiredLabels() {
  return [...document.querySelectorAll("label")]
    .filter(visible)
    .filter((label) => {
      const text = normalize(label.textContent);
      const required =
        text.includes("*") ||
        !!label.querySelector('[class*="required"], [data-testid*="required"]');
      const input = fieldInput(label);
      const empty =
        input instanceof HTMLInputElement ||
        input instanceof HTMLTextAreaElement
          ? !input.value.trim()
          : false;
      return required && empty;
    })
    .map((label) => normalize(label.textContent).replace(/\s*\*\s*$/, ""));
}

async function fillLabeledDropdown(aliases, options) {
  const label = [...document.querySelectorAll("label")].find((candidate) => {
    const text = normalize(candidate.textContent);
    return visible(candidate) && aliases.some((alias) => text.includes(alias));
  });
  if (!(label instanceof HTMLElement)) return true;

  const input = fieldInput(label);
  if (
    (input instanceof HTMLInputElement ||
      input instanceof HTMLTextAreaElement) &&
    input.value.trim() &&
    !normalize(input.value).includes("select")
  )
    return true;

  const clickable =
    input instanceof HTMLElement
      ? input
      : label.querySelector("input, [role='button'], button") || label;
  if (!(clickable instanceof HTMLElement)) return false;
  clickable.click();
  await sleep(200);

  const root = catalogRoot();
  const search = [
    ...(root || document).querySelectorAll(
      'input[type="text"]:not([readonly]), input[type="search"]',
    ),
  ].find(visible);
  if (search instanceof HTMLInputElement && options[0] && !search.readOnly) {
    setNativeValue(search, options[0]);
    await sleep(250);
  }
  return chooseVisibleOption(options, root || undefined);
}

async function fillAppearedDetails(draft) {
  const brand = await fillLabeledDropdown(["brand"], brandOptions(draft));
  const condition = await fillLabeledDropdown(
    ["condition", "status"],
    conditionOptions(draft.condition),
  );
  await fillLabeledDropdown(["size"], ["One size", "Universal", "Other", "os"]);
  await fillLabeledDropdown(
    ["color", "colour"],
    ["Multicolor", "Other", "Black"],
  );
  await fillLabeledDropdown(["package", "parcel"], ["Small", "Medium"]);
  const unfinished = emptyRequiredLabels();
  if (unfinished.length) {
    console.info("[SellMate Vinted] Remaining required fields", unfinished);
    return false;
  }
  return brand && condition;
}

function enabled(element) {
  return (
    element instanceof HTMLElement &&
    !element.hasAttribute("disabled") &&
    element.getAttribute("aria-disabled") !== "true"
  );
}

async function submitListing(draft) {
  const action = byTestId("upload-form-save-button");
  if (!(action instanceof HTMLElement))
    throw new Error("Vinted’s Upload control was not found.");
  if (!enabled(action)) {
    const missing = emptyRequiredLabels();
    throw new Error(
      missing.length
        ? `Vinted still requires: ${missing.join(", ")}.`
        : "Vinted requires another field before this listing can be submitted.",
    );
  }
  await setStatus(
    draft,
    "submitting",
    "Vinted Upload was submitted; waiting for the listing URL.",
  );
  action.click();
}

async function captureListingUrl(draft) {
  if (!/^\/items\/\d+/.test(window.location.pathname)) return false;
  await setStatus(
    draft,
    "live",
    "Vinted listing URL captured.",
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
    console.info("[SellMate Vinted] No pending draft found");
    return;
  }
  console.info("[SellMate Vinted] Starting listing form", {
    requestId: draft.requestId,
    itemId: draft.itemId,
  });

  if (await captureListingUrl(draft)) return;
  if (!window.location.pathname.startsWith("/items/new")) return;

  watchForPublishedListing(draft);
  try {
    const deadline = Date.now() + 90000;
    let reportedFilled = false;
    while (Date.now() < deadline) {
      if (await captureListingUrl(draft)) return;
      if (needsSignIn())
        throw new Error(
          "Sign in to Vinted in this Chrome profile, then retry from SellMate.",
        );
      await dismissConsent();

      const photos = await uploadPhotos(draft.photos);
      const title = await fillByTestId("title--input", draft.title);
      const description = await fillByTestId(
        "description--input",
        draft.description,
      );
      const price = await fillByTestId("price-input--input", draft.price);
      const category = await selectCategory(draft);
      const extras = category ? await fillAppearedDetails(draft) : false;

      console.info("[SellMate Vinted] Field results", {
        photos,
        title,
        description,
        price,
        category,
        extras,
      });

      if (photos && title && description && price && category && extras) {
        if (!reportedFilled) {
          reportedFilled = true;
          await setStatus(
            draft,
            "filled",
            "Vinted listing fields filled. Submitting the reviewed listing.",
          );
        }
        const action = byTestId("upload-form-save-button");
        if (enabled(action)) {
          await submitListing(draft);
          return;
        }
      }
      await sleep(400);
    }
    throw new Error(
      reportedFilled
        ? "Vinted still requires another listing field. Nothing was published."
        : "Vinted changed or rejected a required listing field. Nothing was published.",
    );
  } catch (error) {
    console.error("[SellMate Vinted] Listing automation failed", error);
    const message =
      error instanceof Error
        ? error.message
        : "Vinted’s form could not be filled.";
    await setStatus(draft, "error", message);
  }
}

void run();
