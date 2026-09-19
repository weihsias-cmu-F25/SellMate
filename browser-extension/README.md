# SellMate Marketplace Helper

This unpacked Chrome extension transfers a reviewed SellMate draft into the
seller's existing Facebook Marketplace or Vinted session. It fills available
listing fields and submits after the seller explicitly approves it in SellMate.

It deliberately does not:

- collect or store marketplace credentials;
- bypass login challenges, CAPTCHA, rate limits, or anti-automation controls;
- claim success until the marketplace exposes a real listing URL.

## Install for local development

1. Run SellMate at `http://127.0.0.1:5173` or `http://localhost:5173`.
2. Open `chrome://extensions`, enable **Developer mode**, and choose
   **Load unpacked**.
3. Select this `browser-extension` directory.
4. Sign in to Facebook and/or Vinted normally in the same Chrome profile.
5. In SellMate Review, select Facebook, Vinted, or both; check the review box;
   and use the main publish button. This is the explicit authorization for the
   helper to fill and submit those listings.

Each helper opens an inactive background tab, so Facebook, Vinted, OfferUp, and
other adapters can continue concurrently. The signed-in forms still require
real tabs because extension service workers cannot manipulate page DOM.

When Facebook opens `/marketplace/item/...` or Vinted opens `/items/{id}...`,
the extension sends that URL back to SellMate and the item becomes tracked as
live. Vinted may stop for a sign-in check, category choice, or another
account-specific required field; it reports the blocker without recording a
false success.

## Diagnostics

After changing extension files, reload the unpacked extension from
`chrome://extensions`; Vite hot reload does not update extension scripts.

Diagnostic messages start with `[SellMate Facebook]` or `[SellMate Vinted]`:

- SellMate tab DevTools → **Console**: app-to-extension request and status.
- `chrome://extensions` → this extension → **Service worker / Inspect**:
  background tab-opening errors.
- Marketplace tab DevTools → **Console**: field and submission progress,
  and the exact failed selector or validation step.

## Maintenance

Facebook and Vinted change their form markup without notice. The helper prefers
stable `data-testid` and accessible labels rather than generated CSS class
names, but selectors still need periodic testing. If a required field cannot be
mapped, a login challenge appears, or submission is disabled, the helper stops
and reports an error. It does not attempt to bypass platform controls and never
records that attempt as a successful publication.
