# SellMate frontend concept

## Product direction

“From shelf to sold.” A calm selling workspace with a guided agent flow. Use warm off-white backgrounds, deep olive primary actions, white surfaces, generous spacing, and clear product photography. Keep agent messages short and action-oriented. Show a persistent item preview beside the current task on desktop; collapse it to a compact summary above the task on mobile.

## Pages

1. **Overview `/`** — Primary “Sell an item” action, resumable drafts, active and sold items, and suggestions requiring a decision. Each item shows its photo, title, price, age, and marketplace statuses. Empty state: “Your next sale starts with a photo.”
2. **Sell an item `/sell/:draftId`** — One guided workspace with five steps: Photo → Details → Price → Review → Publish. Persist the draft and allow returning to earlier steps.
3. **Item details `/items/:id`** — The item’s price, age, live listing links, separate statuses per marketplace, activity, price suggestions, and “Mark as sold.” Enter this page from Overview or publishing success.
4. **Connections `/connections`** — Separate eBay and OfferUp demo connection controls and reminder preferences. Treat other marketplace handoffs according to the integrations actually available.

## Guided selling flow

### 1. Photo

- Large “Take a photo” action on mobile; “Upload photos” on desktop.
- Show photo previews, add-photo and retake controls.
- Show actual identification progress, followed by “Looks like Sony WH-1000XM5.”
- Allow correction of brand and model. Ask for a label photo when identification is uncertain.

### 2. Details

- Ask only what is missing: purchase date, damage, accessories, functionality.
- Use a conversation with one question at a time, quick-answer chips, and a free-text composer. Include “Not sure,” persist the conversation, and let users edit earlier replies.
- Show user-confirmed facts in the item preview. Never infer absence of damage from one photo.
- Ask follow-ups only when needed, such as describing a scratch or testing battery performance.

### 3. Price

- Three choices: Fast sale $175, Recommended $205, Max value $229. These are illustrative values supplied for this demo concept, not verified valuations.
- Select Recommended initially; allow a custom price.
- Show the number of comparables, source links, condition, dates, and currency. Distinguish completed sales from active asking prices.
- Explain adjustments for condition and accessories in one or two sentences.
- Show whether fees and shipping are excluded. Avoid promising sale speed without supporting data.
- If research fails or evidence is sparse, expose that state and allow retry or manual pricing.

### 4. Review

- Select multiple connected destinations with checkbox cards, initially selecting connected eBay and OfferUp demo accounts. Keep destination selection separate from draft preview tabs.
- Preview each platform’s generated title, description, photos, category, condition, and price.
- Allow editing before publishing. Editing item facts or price should invalidate affected drafts and prompt regeneration or review.
- Collect required delivery, location, shipping, return, and account policy details before the publish action becomes available.
- Distinguish shared item facts from platform-specific text.
- Use one primary action, “Publish to 2 marketplaces,” reflecting the number of pending destinations.

### 5. Publish

- Publish selected destinations together, with one result row per platform and independent progress.
- eBay and OfferUp demo adapters: Ready → Publishing → Live, or Failed with an actionable retry. The frontend labels these actions as simulated. In production, only show Live after external confirmation and a real listing URL/ID.
- Assisted marketplaces: Open draft → Awaiting confirmation → Live after the seller records a live URL. Merely opening another website does not prove publication.
- Preserve successful results when another platform fails. A retry must avoid creating duplicate listings.
- Success emphasizes the product photo, “Your listings are live,” the result for each selected destination, and “Track this item.”

## Follow-up and sold workflow

- When an unsold item reaches the configured review interval, show an in-app suggestion with current price, proposed price, research timestamp, and affected listings. Offer “Approve price change,” “Keep current price,” and “Remind me later.”
- Record price changes separately per marketplace. Show pending manual updates and failures alongside successes.
- “Mark as sold” opens a brief review asking where it sold, sale price, and which remaining listings to close.
- End or remove listings through supported integrations. For manual platforms, link to the live listing and let the seller confirm removal.
- Keep an explicit cleanup checklist: Closing / Removed / Needs action / Failed. Never label cleanup complete while a tracked listing remains unresolved.
- Keep the item in sold history after cleanup, including its sale and platform records.

## Layout and scope

Desktop: compact left navigation, main task area, approximately two-thirds width for the agent/task and one-third for the item preview. Use one clear primary action at each step. Mobile: single column, compact progress labels, large camera action and touch targets, and marketplace cards stacked vertically.

For the hackathon, build the full photo-to-confirmed-eBay-listing path first, then tracking and sold cleanup. Demonstrate manual handoff honestly for any platform without a working integration. Defer advanced analytics, buyer messaging, multi-item bulk actions, and elaborate onboarding.

The accompanying interactive concept uses sample data and simulated external actions. Real recognition, research, authentication, publishing, scheduling, and removal must be connected and tested separately.
