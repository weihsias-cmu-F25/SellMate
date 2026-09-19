const DRAFT_KEY = "sellmateFacebookDraft";
const STATUS_KEY = "sellmateFacebookStatus";
const VINTED_DRAFT_KEY = "sellmateVintedDraft";
const VINTED_STATUS_KEY = "sellmateVintedStatus";
const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

function postStatus(platform, status) {
  console.info(`[SellMate ${platform}] Status received`, {
    requestId: status?.requestId,
    state: status?.state,
    message: status?.message,
  });
  window.postMessage(
    { type: `SELLMATE_${platform.toUpperCase()}_STATUS`, status },
    window.location.origin,
  );
}

window.addEventListener("message", (event) => {
  if (event.source !== window || !ALLOWED_ORIGINS.has(event.origin)) return;

  if (event.data?.type === "SELLMATE_FACEBOOK_GET_STATUS") {
    void chrome.storage.local.get(STATUS_KEY).then((stored) => {
      if (stored[STATUS_KEY]) postStatus("Facebook", stored[STATUS_KEY]);
    });
    return;
  }

  if (event.data?.type === "SELLMATE_VINTED_GET_STATUS") {
    void chrome.storage.local.get(VINTED_STATUS_KEY).then((stored) => {
      if (stored[VINTED_STATUS_KEY])
        postStatus("Vinted", stored[VINTED_STATUS_KEY]);
    });
    return;
  }

  const platform =
    event.data?.type === "SELLMATE_FACEBOOK_PREPARE"
      ? "Facebook"
      : event.data?.type === "SELLMATE_VINTED_PREPARE"
        ? "Vinted"
        : null;
  if (!platform) return;
  const draft = event.data.draft;
  console.info(`[SellMate ${platform}] Draft request received`, {
    requestId: draft?.requestId,
    itemId: draft?.itemId,
  });
  const valid =
    draft &&
    typeof draft.requestId === "string" &&
    typeof draft.itemId === "string" &&
    typeof draft.title === "string" &&
    typeof draft.description === "string" &&
    Number.isFinite(draft.price) &&
    Array.isArray(draft.photos) &&
    draft.photos.every(
      (photo) =>
        typeof photo?.dataUrl === "string" &&
        /^data:image\/(jpeg|png|webp);base64,/.test(photo.dataUrl),
    );

  if (!valid) {
    console.error(`[SellMate ${platform}] Draft validation failed`);
    window.postMessage(
      {
        type: `SELLMATE_${platform.toUpperCase()}_ACCEPTED`,
        requestId: draft?.requestId,
        ok: false,
        error: `The ${platform} draft was incomplete.`,
      },
      window.location.origin,
    );
    return;
  }

  const draftKey = platform === "Facebook" ? DRAFT_KEY : VINTED_DRAFT_KEY;
  const openType =
    platform === "Facebook"
      ? "OPEN_FACEBOOK_MARKETPLACE"
      : "OPEN_VINTED_LISTING";
  void chrome.storage.local
    .set({ [draftKey]: draft })
    .then(
      () =>
        new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { type: openType, requestId: draft.requestId },
            (response) => {
              if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
              else if (!response?.ok)
                reject(
                  new Error(response?.error || `Could not open ${platform}.`),
                );
              else resolve();
            },
          );
        }),
    )
    .then(
      () => {
        console.info(`[SellMate ${platform}] Draft accepted by extension`);
        return window.postMessage(
          {
            type: `SELLMATE_${platform.toUpperCase()}_ACCEPTED`,
            requestId: draft.requestId,
            ok: true,
          },
          window.location.origin,
        );
      },
      (error) => {
        console.error(`[SellMate ${platform}] Bridge request failed`, error);
        return window.postMessage(
          {
            type: `SELLMATE_${platform.toUpperCase()}_ACCEPTED`,
            requestId: draft.requestId,
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : `Could not open ${platform}.`,
          },
          window.location.origin,
        );
      },
    );
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[STATUS_KEY]?.newValue)
    postStatus("Facebook", changes[STATUS_KEY].newValue);
  if (changes[VINTED_STATUS_KEY]?.newValue)
    postStatus("Vinted", changes[VINTED_STATUS_KEY].newValue);
});
