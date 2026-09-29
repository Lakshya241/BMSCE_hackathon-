# Chain Sentry — Backend

Express + WebSocket server. Owns all data, hashing, and blockchain anchoring.
Private keys **never** leave this process.

```bash
npm install
npm run seed              # seed the JSON store (11 collections)
npm run dev               # http://localhost:4000  (REST) + ws://localhost:4000/ws (live)
```

## Live MST anchoring

```bash
cp .env.example .env      # then fill in:
# MST_RPC_URL=            MST testnet JSON-RPC
# MST_PRIVATE_KEY=        funded wallet key (server-side only)
# MST_CONTRACT_ADDRESS=   deployed ChainSentry contract
# MST_CHAIN_ID=           testnet chain id
# MST_EXPLORER_URL=       enables "Open in MSTScan" links
```

Without env vars the backend runs **DEMO MODE**: transactions are real SHA-256 digests
computed locally and permanently labeled `SIMULATED / DEMO`. Live failures are recorded
as `status:"failed"` — the backend never fabricates a successful on-chain transaction.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/state` | full snapshot (all collections + analytics + blockchain state) |
| GET/POST/PATCH | `/api/incidents` | list · create (hash→anchor→verify pipeline) · patch |
| GET/POST | `/api/evidence` | list · `tamper` · `reverify` · `verify` (hash lookup) |
| GET/POST/PATCH/DELETE | `/api/cameras` | fleet management |
| GET/POST/PATCH | `/api/alerts` | alerts + ack |
| GET/POST | `/api/nodes` | failover / reactivate |
| GET/PATCH | `/api/settings` | policy |
| GET | `/api/blockchain` | chain state + recent txs |
| POST | `/api/blockchain/register-verifier` | wallet-signature verifier registration (live mode) |
| GET | `/api/analytics` · `/api/activity` | aggregations · ledger |
| POST | `/api/demo` | `{step:0\|1\|2}` — the 3-step hackathon demo |
| WS | `/ws` | live snapshot + event stream |

## Deploy the contract

```bash
cd contracts   # ChainSentry.sol (Solidity ^0.8.24)
forge create ChainSentry.sol:ChainSentry --rpc-url $MST_RPC_URL --private-key $MST_PRIVATE_KEY
```

## Python OpenCV detector (optional)

```bash
cd python && pip install opencv-python requests
python detector.py --source 0 --camera CAM-001 --api http://localhost:4000 --show
```
