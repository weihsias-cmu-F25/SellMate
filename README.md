# SellMate

AI resale agent for moving / local secondhand sales.  
**UI:** React + Vite (`src/`) · **Agent API:** Express (`server/`) integrated from `sellmate_demo`.

## Run locally

Requires Node.js 22.12+.

```sh
npm install
cp .env.example .env.local   # optional: add OPENAI_API_KEY
npm run dev
```

This starts:

- Agent API → http://127.0.0.1:3001  
- Web UI → http://127.0.0.1:5173 (proxies `/api` → the agent)

```sh
npm run build
npm test
npm run preview
```

### Environment

| Variable | Where | Notes |
|---|---|---|
| `OPENAI_API_KEY` | `.env.local` (server) | Enables live vision + listing copy. Empty = demo fallbacks |
| `OPENAI_VISION_MODEL` | server | Default `gpt-4o-mini` |
| `OPENAI_TEXT_MODEL` | server | Default `gpt-4o-mini` |
| `VITE_DEMO_FAIL_PUBLISH` | frontend | Simulate publish failures |
| `VITE_DEMO_FAIL_PLATFORMS` | frontend | e.g. `offerup` |

## Try the demo

1. **Sell an item** → upload a photo (or try the headphones sample).
2. Agent identifies the item and asks **3–5 tailored questions**.
3. **Find my price** → curated local comps + sell-speed pricing.
4. Generate drafts → review → publish to eBay / OfferUp (**mocked adapters**).
5. Mark sold → cleanup remaining managed listings.

## Architecture

```
Browser (SellMate UI)
  → /api/*  (Vite proxy)
    → Express agent (identify, questions, research, listings, publish)
      → OpenAI (optional)
      → Mock marketplace adapters
```

| Path | Role |
|---|---|
| `src/` | Official frontend / lifecycle UI |
| `server/` | Agent backend (from sellmate_demo) |
| `src/services.ts` | Frontend → API client with offline fallbacks |
| `src/detailQuestions.ts` | Uses `item.questionPlan` when present |

## Still demo / not production

- Marketplace **publish / remove** are mocked (no real eBay/Facebook/OfferUp OAuth).
- Comparable prices are **curated** Bay Area comps (not live eBay Browse yet).
- Item state still lives in **browser localStorage**.

Routes use browser history. When hosting `dist/`, serve `index.html` for `/items/:id` and `/sell/:id`.
