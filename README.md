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

| Variable                   | Where                 | Notes                                                      |
| -------------------------- | --------------------- | ---------------------------------------------------------- |
| `OPENAI_API_KEY`           | `.env.local` (server) | Enables live vision + listing copy. Empty = demo fallbacks |
| `OPENAI_VISION_MODEL`      | server                | Default `gpt-4o-mini`                                      |
| `OPENAI_TEXT_MODEL`        | server                | Default `gpt-4o-mini`                                      |
| `VITE_DEMO_FAIL_PUBLISH`   | frontend              | Simulate publish failures                                  |
| `VITE_DEMO_FAIL_PLATFORMS` | frontend              | e.g. `offerup`                                             |

## Try the demo

1. **Sell an item** → upload a photo (or try the headphones sample).
2. Agent identifies the item and asks **3–5 tailored questions**.
3. **Find my price** → curated local comps + sell-speed pricing.
4. Generate drafts → select destinations → review → publish. OfferUp uses a **mocked adapter**; Facebook Marketplace and Vinted use the optional browser helper to submit listings in your signed-in browser. Only selected destinations appear in draft previews.
5. Track each platform’s result independently. Mark sold → cleanup managed listings and confirm removal of browser-assisted listings.

## Architecture

```
Browser (SellMate UI)
  → /api/*  (Vite proxy)
    → Express agent (identify, questions, research, listings, publish)
      → OpenAI (optional)
      → Mock OfferUp adapter
  → Browser helper → Facebook Marketplace / Vinted
```

| Path                     | Role                                         |
| ------------------------ | -------------------------------------------- |
| `src/`                   | Official frontend / lifecycle UI             |
| `server/`                | Agent backend (from sellmate_demo)           |
| `src/services.ts`        | Frontend → API client with offline fallbacks |
| `src/detailQuestions.ts` | Uses `item.questionPlan` when present        |

## Marketplace browser helper

See [browser-extension/README.md](browser-extension/README.md) for setup. Load the extension in Chrome and sign in to Facebook and/or Vinted normally. The review checkbox and Publish button authorize submission to selected destinations. The helper stops for unsupported forms, required account checks, or other blockers; it does not bypass CAPTCHA or platform controls. Listings are recorded as live only after a real listing URL is received.

## Still demo / not production

- OfferUp **publish / remove** and managed price changes are mocked. Facebook and Vinted publishing use the browser helper, without OAuth integration. Their removal remains manual.
- Comparable prices are **curated** Bay Area comps (not live eBay Browse yet).
- Item state still lives in **browser localStorage**.

Routes use browser history. When hosting `dist/`, serve `index.html` for `/items/:id` and `/sell/:id`.
