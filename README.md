# 🛡️ Chain Sentry

### Decentralized AI Surveillance & Tamper-Evident Evidence Network

> **See the incident. Prove the evidence. Trust the chain.**

Chain Sentry is an AI-powered decentralized evidence network that makes surveillance events **verifiable and tamper-evident**. Incidents are detected by real computer vision, sealed with **SHA-256 digests**, anchored on the **MST blockchain** by the backend, and confirmed by a **multi-agent verification quorum** — all streamed live to every console over **WebSockets**.

---

## Repository layout

```
chain-sentry/
├── frontend/     # Next.js 15 console — light theme, 3D hero, live WS data
├── backend/      # Express + WebSocket API — JSON store, hashing, MST anchoring
│   ├── contracts/ChainSentry.sol   # Solidity ^0.8.24 evidence registry
│   ├── python/detector.py          # OpenCV incident detector service
│   ├── scripts/seed.mjs            # demo data seeder
│   └── data/                       # the JSON "database" (11 collections)
└── README.md
```

**Architecture rule:** the frontend holds zero state and zero keys. All data, hashing, and blockchain signing happens in the backend; the frontend renders live snapshots and fires actions.

## Quick start

```bash
# 1 · backend
cd backend
npm install
npm run seed          # seed 11 JSON collections with demo data
npm run dev           # REST :4000  +  live WS ws://localhost:4000/ws

# 2 · frontend (new terminal)
cd frontend
npm install
cp .env.example .env  # NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
npm run dev           # http://localhost:3000
```

Open **http://localhost:3000** — the landing page shows a **LIVE** badge once the WebSocket connects, plus real-time stats straight from the backend.

## The 60-second demo (hackathon script)

1. Console → **Overview** → click **Simulate Incident**
   → 3 agents vote live (Vision / Behavior / Context) → consensus 3/3
   → SHA-256 evidence hash generated → MST anchor transaction confirmed
   → 🚨 incident verified, alert raised
2. Click **Simulate Evidence Tampering**
   → the stored evidence mutates → anchored hash ≠ current hash
   → 🚨 TAMPERING DETECTED — status INVALID, tamper tx reported on-chain
3. Click **Simulate Camera Attack**
   → camera goes dark → tamper recorded → mesh failover engages
4. **Detection Lab** — start the simulated feed (or your webcam / a video file),
   draw a restricted zone or tripwire, and walk through it: a real incident flows
   through the whole pipeline: detect → hash → anchor → verify → alert.

## Live data (WebSocket)

The backend pushes two message types on `ws://localhost:4000/ws`:

- `snapshot` — full application state after every change (source of truth)
- `event` — granular live events: `incident_created`, `agent_vote`, `verification_complete`, `tx_submitted`, `tx_confirmed`, `tamper_detected`, `camera_tamper`, `node_failover`, `settings_update`

The frontend reconnects automatically and falls back to REST polling if the socket drops.

## MST blockchain integration

| Mode | Trigger | Behavior |
|---|---|---|
| **DEMO** (default) | no env vars | Real SHA-256 digests, simulated transport, permanently labeled `SIMULATED / DEMO` |
| **LIVE** | `backend/.env` configured | ethers v6 signs + broadcasts `anchorEvidence()` to the ChainSentry contract; MSTScan links appear |

```ini
# backend/.env
MST_RPC_URL=
MST_PRIVATE_KEY=        # server-side only, never sent to the browser
MST_CONTRACT_ADDRESS=
MST_CHAIN_ID=
MST_EXPLORER_URL=
```

`backend/contracts/ChainSentry.sol` exposes `registerCamera`, `registerVerifier` (wallet-signature
verified), `createIncident`, **`anchorEvidence(incidentId, cameraId, evidenceHash, timestamp, eventType)`**,
`verifyEvidence`, `recordVerification`, `updateIncidentStatus`, `recordCameraTamper`, `createSecurityBounty`.
Only hashes and metadata go on-chain — video never does. Live tx failures are recorded as `status:"failed"`;
the system never fabricates a successful transaction.

## How evidence hashing works

1. Incident fires → canonical packet serialized `{id, cameraId, type, timestamp, frames, risk, detections}`
2. SHA-256 digest stored as `originalHash` in `backend/data/evidence.json` and anchored on MST
3. Any later check compares `currentHash` vs `originalHash`: equal → **AUTHENTIC**, different → **TAMPERED**
4. The Evidence Vault's independent verifier lets anyone paste a hash and check it against the vault

## How verification works

Vision / Behavior / Context agents each vote from the incident's real data (frame digest, risk signature,
zone context). Each vote streams live to connected clients. ≥2 confirms → consensus. Same data ⇒ same
consensus — deterministic and auditable.

## Python OpenCV service (optional)

```bash
cd backend/python && pip install opencv-python requests
python detector.py --source 0 --camera CAM-001 --api http://localhost:4000 --show
```

MOG2 background subtraction + HOG person detector, posting to the same pipeline.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind v4 (light theme), Framer Motion |
| 3D | Three.js, React Three Fiber, Drei (gyro rings, helix chain blocks, shockwave, grid floor) |
| Charts | Recharts |
| Backend | Node 22, Express 4, ws, ethers v6 |
| Storage | JSON files via one module (`backend/src/lib/db.ts`) |
| CV | Canvas heuristics (frontend) + OpenCV MOG2/HOG (python service) |

## Security considerations

- Private keys exist only in the backend process; the browser never sees them
- Demo txs are unforgeably labeled to prevent "fake chain" claims during judging
- JSON layer normalizes paths (no traversal)
- Raw video stays off-chain by design

## Limitations (honest scope)

- In-browser person detection is a luminance-blob heuristic; the Python service uses OpenCV HOG/SVM
- Demo "blocks" simulate confirmation timing, not consensus
- JSON storage is single-process — use a real DB for multi-instance deployments
- ZK proofs are roadmap, not implemented

## Future scope

- ZK proofs of detection (prove "a person appeared" without revealing frames)
- DePIN tokenomics: staking/slashing for verifiers, camera uptime bonds
- ONNX models in-browser via WebGPU · IPFS/Arweave encrypted storage · MST mainnet

---

Every button works. Every claim is checkable. Built for the MST hackathon.
