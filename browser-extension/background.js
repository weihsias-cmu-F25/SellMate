const DRAFT_KEY = "sellmateFacebookDraft";
const STATUS_KEY = "sellmateFacebookStatus";
const VINTED_DRAFT_KEY = "sellmateVintedDraft";
const VINTED_STATUS_KEY = "sellmateVintedStatus";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    !["OPEN_FACEBOOK_MARKETPLACE", "OPEN_VINTED_LISTING"].includes(
      message?.type,
    )
  )
    return;

  void (async () => {
    const vinted = message.type === "OPEN_VINTED_LISTING";
    const platform = vinted ? "Vinted" : "Facebook";
    const draftKey = vinted ? VINTED_DRAFT_KEY : DRAFT_KEY;
    const statusKey = vinted ? VINTED_STATUS_KEY : STATUS_KEY;
    try {
      console.info(`[SellMate ${platform}] Open request received`, {
        requestId: message.requestId,
      });
      const stored = await chrome.storage.local.get(draftKey);
      const draft = stored[draftKey];
      if (!draft || draft.requestId !== message.requestId)
        throw new Error(`The ${platform} draft is missing or expired.`);

      await chrome.storage.local.set({
        [statusKey]: {
          requestId: draft.requestId,
          itemId: draft.itemId,
          state: "opened",
          message: `${platform} listing flow opened.`,
        },
      });
      await chrome.tabs.create({
        url: vinted
          ? "https://www.vinted.com/items/new"
          : "https://www.facebook.com/marketplace/create/item",
        active: false,
      });
      console.info(`[SellMate ${platform}] Background tab opened`);
      sendResponse({ ok: true });
    } catch (error) {
      console.error(
        `[SellMate ${platform}] Failed to open listing flow`,
        error,
      );
      sendResponse({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : `Could not open ${platform}.`,
      });
    }
  })();
  return true;
});
