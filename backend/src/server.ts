import "dotenv/config"; // loads backend/.env — MST credentials live here
import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import { router } from "./routes";
import { initHub, clientCount } from "./ws/hub";
import { getBlockchainState } from "./lib/blockchain";

const rawPort = Number(process.env.PORT);
const PORT = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 4000;
const ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

const app = express();
app.use(cors({ origin: ORIGIN }));
app.use(express.json({ limit: "1mb" }));

// Serve the JSON data dir read-only for debugging (optional)
app.use("/data", express.static(path.join(process.cwd(), "data"), { fallthrough: false }));

app.use("/api", router);

app.get("/", (_req, res) => {
  const bc = getBlockchainState();
  res.json({
    service: "Chain Sentry Backend",
    version: "1.0.0",
    blockchain: { mode: bc.mode, network: bc.network, contract: bc.contractAddress },
    wsClients: clientCount(),
    endpoints: ["/api/state", "/api/incidents", "/api/evidence", "/api/cameras", "/api/alerts", "/api/nodes", "/api/settings", "/api/blockchain", "/api/analytics", "/api/activity", "/api/demo", "/ws"],
  });
});

const server = http.createServer(app);
initHub(server);

server.listen(PORT, () => {
  const bc = getBlockchainState();
  console.log(`\n  🛡️  Chain Sentry backend listening on http://localhost:${PORT}`);
  console.log(`      WebSocket live data: ws://localhost:${PORT}/ws`);
  console.log(`      Blockchain mode: ${bc.mode === "live" ? "LIVE (on-chain anchoring)" : "DEMO (simulated, clearly labeled)"}`);
  console.log("");
});
