# Chain Sentry — Frontend

Next.js 15 (App Router) + React 19 + Tailwind v4 light-theme console with live WebSocket data.

```bash
npm install
cp .env.example .env      # point at the backend (default http://localhost:4000)
npm run dev               # http://localhost:3000
```

- REST calls go to `/backend/api/*` (proxied to the backend by `next.config.ts` rewrites).
- Live data arrives over WebSocket from `ws://localhost:4000/ws` — the landing page and dashboard
  re-render in real time as incidents, agent votes, MST transactions, tampers and node failovers happen.
- If the WebSocket is down, the app automatically falls back to REST polling.
