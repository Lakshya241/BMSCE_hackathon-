import { readJSON } from "./db";
import type { Analytics, Evidence, Incident, Transaction, Verification } from "./types";

export function buildAnalytics(): Analytics {
  const incidents = readJSON<Incident[]>("incidents", []) as Incident[];
  const verifications = readJSON<Verification[]>("verifications", []) as Verification[];

  const byType = new Map<string, number>();
  for (const i of incidents) byType.set(i.type, (byType.get(i.type) ?? 0) + 1);
  const incidentsByType = [...byType.entries()].map(([type, count]) => ({ type, count }));

  const buckets = { Low: 0, Medium: 0, High: 0, Critical: 0 };
  for (const i of incidents) {
    if (i.riskScore < 40) buckets.Low++;
    else if (i.riskScore < 60) buckets.Medium++;
    else if (i.riskScore < 80) buckets.High++;
    else buckets.Critical++;
  }
  const riskDistribution = Object.entries(buckets).map(([name, value]) => ({ name, value }));

  const daily: Analytics["daily"] = [];
  for (let d = 6; d >= 0; d--) {
    const day = new Date(Date.now() - d * 86_400_000);
    const key = day.toISOString().slice(0, 10);
    const dayIncidents = incidents.filter((i) => i.timestamp.slice(0, 10) === key);
    daily.push({
      day: day.toLocaleDateString("en-US", { weekday: "short" }),
      incidents: dayIncidents.length,
      high: dayIncidents.filter((i) => i.riskScore >= 60).length,
      verified: dayIncidents.filter((i) => i.verificationStatus === "verified").length,
      tampers: dayIncidents.filter((i) => i.status === "investigating").length,
    });
  }

  const verifiedCount = verifications.filter((v) => v.consensus === "confirmed").length;
  return {
    incidentsByType,
    riskDistribution,
    daily,
    verificationRate: verifications.length ? Math.round((verifiedCount / verifications.length) * 100) : 0,
    avgRisk: incidents.length ? Math.round(incidents.reduce((s, i) => s + i.riskScore, 0) / incidents.length) : 0,
  };
}

export function networkStats() {
  const incidents = readJSON<Incident[]>("incidents", []) as Incident[];
  const txs = readJSON<Transaction[]>("transactions", []) as Transaction[];
  const evidence = readJSON<Evidence[]>("evidence", []) as Evidence[];
  return {
    totalIncidents: incidents.length,
    activeIncidents: incidents.filter((i) => i.status === "active").length,
    verified: incidents.filter((i) => i.verificationStatus === "verified").length,
    tampered: evidence.filter((e) => e.tampered).length,
    totalTx: txs.length,
    confirmedTx: txs.filter((t) => t.status === "confirmed").length,
  };
}
