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
4. Review the draft, enter a location, and confirm the review checkbox.
5. Publish to the **demo** eBay account. Track the item from the success screen.
6. Open the seeded Sony item on Overview to try the price review, or use **Connections → Advance demo**.
7. Mark an item sold. The demo ends its eBay listing; manual listings remain on a cleanup checklist.

The seeded illustrations and prices are examples. Uploaded photos are processed locally and stored with drafts in browser localStorage. No real product recognition, market research, OAuth, publishing, price updates, or listing removal occurs. Buttons opening marketplaces navigate to their websites; they do not submit or prefill a listing. Record a live URL only after completing publication yourself.

Price reminders appear in-app when opened; there is no background scheduler. Connections includes controls to restore the sample workspace or clear local items. Clearing browser data removes saved drafts. The UI warns if browser persistence is unavailable or full.

## Backend integration

- `src/services.ts`: replace the `SellingService` demo adapter with calls to your backend. Keep API tokens and marketplace credentials on the server.
- `src/model.ts`: item, research, platform listing, reminder, and cleanup states; pure lifecycle functions.
- `src/store.tsx`: local persistence and item updates. Replace with authenticated server persistence for real accounts.
- `src/pages/Sell.tsx`: photo → questions → price → review → publication.
- `src/DetailsChat.tsx` and `src/detailQuestions.ts`: saved conversation and the local demo question policy. Replace the policy with your agent's structured next-question response for live AI questioning. Free-text replies are preserved; the frontend does not pretend to understand arbitrary text as an LLM would.
- `src/pages/ItemDetails.tsx`: marketplace tracking, price review, and sold cleanup.

For production, add real source URLs and timestamps to comparables, eBay listing IDs and live links, complete shipping/return policies, authenticated integrations, and independently confirmed publication/removal states. Current demo-only operations must not be treated as external success. Add idempotency on server-side publication so retries cannot create duplicate listings.

To inspect the publish error state, set `VITE_DEMO_FAIL_PUBLISH=true` in `.env.local` and restart the dev server. Remove it to restore successful demo publishing. This variable contains no secret.

Routes use browser history. When hosting `dist/`, configure the host to serve `index.html` for app routes such as `/items/:id` and `/sell/:id`.
