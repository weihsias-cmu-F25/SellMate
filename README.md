# SellMate

A responsive React + TypeScript frontend for a selling agent. The app runs independently of a backend so the entire hackathon flow can be demonstrated.

## Run locally

Requires Node.js 22.12+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, normally http://127.0.0.1:5173.

```sh
npm run build   # Type-check and create dist/
npm test        # Listing lifecycle and persistence checks
npm run preview
```

## Try the demo

1. Click **Sell an item** → **Try the headphones demo**, or upload your own JPG, PNG, or WebP images.
2. Chat with SellMate one question at a time. Tap quick answers or type a reply; questions adapt to the item type and skip known details. Edit earlier replies using the pencil button, then select **Find my price**.
3. Choose an example price and generate platform-specific drafts.
4. Select Vinted, OfferUp, Facebook Marketplace, or any combination. Preview and edit each draft, enter a location, and confirm the review checkbox. Preview tabs do not change the selected destinations. Facebook and Vinted require the optional local browser helper and use the seller's logged-in tabs.
5. Click the single **Publish to … marketplaces** button to start every selected destination together. OfferUp uses a demo adapter; Facebook and Vinted use parallel browser-helper tabs. Each marketplace reports progress and success independently, and retrying skips listings already live. Track the item from the results screen.
6. Open the seeded Sony item on Overview to try the price review, or use **Connections → Advance demo**.
7. Mark an item sold. The demo ends its managed OfferUp listings; assisted and manual listings remain on a cleanup checklist.

The seeded illustrations and prices are examples. Uploaded photos are processed locally and stored with drafts in browser localStorage. No real product recognition, market research, OAuth, API-managed publishing, price updates, or listing removal occurs. The optional browser helper can fill and submit Facebook and Vinted forms in the seller's own logged-in Chrome profile after explicit approval in SellMate; it does not bypass login challenges, CAPTCHA, rate limits, or other platform controls. SellMate records a listing only after the marketplace exposes a real listing URL.

Price reminders appear in-app when opened; there is no background scheduler. Connections includes controls to restore the sample workspace or clear local items. Clearing browser data removes saved drafts. The UI warns if browser persistence is unavailable or full.

## Marketplace browser helper

For local setup and its safety boundaries, see [`browser-extension/README.md`](browser-extension/README.md). Load that directory as an unpacked Chrome extension, sign in to Facebook and/or Vinted normally, then select those destinations in Review. The SellMate review checkbox and main publish button are the seller's explicit approval for those submissions. If a changing form, required field, seller policy, or account check prevents deterministic submission, the helper stops instead of bypassing the control.

## Backend integration

- `src/services.ts`: replace the `SellingService` demo adapter with calls to your backend. Keep API tokens and marketplace credentials on the server.
- `src/model.ts`: item, research, platform listing, reminder, and cleanup states; pure lifecycle functions.
- `src/store.tsx`: local persistence and item updates. Replace with authenticated server persistence for real accounts.
- `src/pages/Sell.tsx`: photo → questions → price → review → publication.
- `src/publishing.ts`: selected destinations, readiness validation, concurrent publishing, and independent results. Connections stores the remaining OfferUp demo connection separately from browser-assisted destinations.
- `src/DetailsChat.tsx` and `src/detailQuestions.ts`: saved conversation and the local demo question policy. Replace the policy with your agent's structured next-question response for live AI questioning. Free-text replies are preserved; the frontend does not pretend to understand arbitrary text as an LLM would.
- `src/pages/ItemDetails.tsx`: marketplace tracking, price review, and sold cleanup.

For production, add real source URLs and timestamps to comparables, Vinted listing IDs and live links, complete shipping/return policies, authenticated integrations, and independently confirmed publication/removal states. Current demo-only operations must not be treated as external success. Add idempotency on server-side publication so retries cannot create duplicate listings.

To inspect all-platform failure, set `VITE_DEMO_FAIL_PUBLISH=true` in `.env.local` and restart the dev server. For partial failure, use `VITE_DEMO_FAIL_PLATFORMS=offerup` instead (comma-separated platform IDs are supported). Remove the flag and restart to retry failed destinations without reposting successful ones. These variables contain no secrets.

Routes use browser history. When hosting `dist/`, configure the host to serve `index.html` for app routes such as `/items/:id` and `/sell/:id`.
