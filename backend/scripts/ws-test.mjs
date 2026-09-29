/* WS smoke test: connect, fire an incident, count snapshots + events. */
import WebSocket from "ws";

const ws = new WebSocket("ws://127.0.0.1:4000/ws");
let snapshots = 0;
const events = [];

ws.on("message", (d) => {
  const m = JSON.parse(d);
  if (m.type === "snapshot") snapshots++;
  if (m.type === "event") events.push(m.event.kind + ": " + m.event.message.slice(0, 70));
});

ws.on("open", async () => {
  const res = await fetch("http://127.0.0.1:4000/api/incidents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cameraId: "CAM-002", type: "restricted_entry", title: "WS test breach",
      severity: "high", riskScore: 88, description: "restricted zone breach", zone: "vault", frames: 16,
    }),
  });
  const inc = await res.json();
  console.log("created:", inc.id);
  setTimeout(() => {
    console.log("snapshots received:", snapshots);
    console.log("events received:", events.length);
    events.slice(0, 8).forEach((e) => console.log("  •", e));
    process.exit(0);
  }, 4500);
});

ws.on("error", (e) => {
  console.error("WS error:", e.message);
  process.exit(1);
});
