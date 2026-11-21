# Web — the Marketplace Control Tower

React 19 · Vite · Tailwind v4 · TanStack Query · Radix · GSAP · Recharts. What it is for and how each page maps to a role: [`docs/product.md`](../docs/product.md).

```bash
npm ci
npm run dev        # :5173, proxies /api → http://localhost:8000 (VITE_API_URL to change)
npm run lint && npm test && npm run build
```

```
src/
├── app/           providers + router (lazy pages)
├── styles/        tokens.css (graphite + paper themes), base.css
├── lib/           api.ts (typed client), format.ts (₹ lakh/crore), kpi.ts (K1–K12 glossary), motion.ts (GSAP), hooks.ts
├── components/    brand/ (the mark), shell/ (sidebar, ⌘K, period, freshness), data/ (KPI tiles, dot-matrix, charts, tables, states)
└── features/      today · revenue · customers · sellers · fulfillment · inventory · forecast · ask · data
```

Design system "Signal": orange only for *act now* and live data, violet for forecasts and AI; Source Serif 4 headlines, Inter text, IBM Plex Mono identifiers; motion is disabled under `prefers-reduced-motion`. In Docker, nginx serves the build and proxies `/api` to the API (`nginx.conf`).
