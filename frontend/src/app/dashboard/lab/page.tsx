"use client";

import DetectionLab from "@/components/DetectionLab";
import { useDashboard } from "@/components/DashboardProvider";

export default function LabPage() {
  const { state, api, refresh } = useDashboard();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Detection Lab</h1>
        <p className="text-sm text-slate-500">
          Real computer vision in your browser — simulated CCTV, your webcam, or an uploaded video.
          Draw zones and tripwires, then let incidents flow through the backend pipeline: hash → anchor → verify.
        </p>
      </div>
      <DetectionLab
        settings={state.settings}
        onIncident={async (payload) => {
          await api.createIncident(payload);
          refresh();
        }}
      />
    </div>
  );
}
