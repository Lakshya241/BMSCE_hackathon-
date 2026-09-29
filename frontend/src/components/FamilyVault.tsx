"use client";

import { useRef, useState } from "react";
import { UserPlus, Trash2, ShieldCheck, ImageIcon, Users, Fingerprint, Loader2 } from "lucide-react";
import { useDashboard } from "./DashboardProvider";
import { Btn } from "./ui";
import { extractFaceRGB } from "@/lib/faceMatch";
import type { FamilyMember } from "@/lib/types";

/**
 * Family Face Vault — the only place family photos are stored.
 * Each photo becomes a perceptual signature (5x5 luma grid + 24-bin hue
 * histogram, computed backend-side) plus a small thumbnail. The Detection Lab's
 * privacy gate matches live faces against these signatures: family → video is
 * suppressed, strangers → video is stored.
 */

const RELATIONS = ["family", "mother", "father", "sister", "brother", "son", "daughter", "grandmother", "grandfather", "pet-human"];

export function FamilyVault() {
  const { state, api, toast } = useDashboard();
  const members = state.family ?? [];
  const stats = state.captureStats;
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [busy, setBusy] = useState(false);
  const [webcamOn, setWebcamOn] = useState(false);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("family");
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [previewFace, setPreviewFace] = useState<{ rgb: number[]; width: number; height: number } | null>(null);

  const processPhoto = async (file: File) => {
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
      // Downscale to 200px so the JSON store stays lean
      const c = document.createElement("canvas");
      const scale = Math.min(1, 200 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const small = c.toDataURL("image/jpeg", 0.7);
      // Center-crop face-ish region (center 55%) for the signature
      const fx = c.width * 0.225, fy = c.height * 0.08, fw = c.width * 0.55, fh = c.height * 0.62;
      const crop = extractFaceRGB(c, { x: fx / c.width, y: fy / c.height, w: fw / c.width, h: fh / c.height }, 32);
      if (!crop) throw new Error("could not read pixels");
      setPreviewPhoto(small);
      setPreviewFace(crop);
      toast("Photo ready — enter name + relation, then Enroll", "info");
    } catch {
      toast("Could not read that image", "high");
    } finally {
      setBusy(false);
    }
  };

  const enrollUploaded = async () => {
    if (!previewPhoto || !previewFace || !name.trim()) return;
    setBusy(true);
    try {
      await api.addFamilyMember({ name: name.trim(), relation, photo: previewPhoto, photoRaw: previewPhoto, rgb: previewFace.rgb, width: previewFace.width, height: previewFace.height });
      toast(`✅ ${name.trim()} enrolled — privacy gate updated`, "success");
      setName("");
      setPreviewPhoto(null);
      setPreviewFace(null);
    } catch {
      toast("Enrollment failed", "high");
    } finally {
      setBusy(false);
    }
  };

  const startWebcamEnroll = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480 }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setWebcamOn(true);
    } catch {
      toast("Webcam permission denied", "high");
    }
  };

  const captureFromWebcam = () => {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = 200; c.height = 150;
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    const photo = c.toDataURL("image/jpeg", 0.7);
    const crop = extractFaceRGB(c, { x: 0.225, y: 0.06, w: 0.55, h: 0.64 }, 32);
    if (!crop) { toast("Could not read camera frame", "high"); return; }
    setPreviewPhoto(photo);
    setPreviewFace(crop);
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    setWebcamOn(false);
  };

  const removeMember = async (m: FamilyMember) => {
    await api.removeFamilyMember(m.id);
    toast(`${m.name} removed from vault`, "info");
  };

  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        {/* enrollment */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <UserPlus size={17} className="text-cyan-700" />
            <h2 className="font-extrabold text-slate-900">Enroll a family member</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Upload a photo or use the webcam. Only a thumbnail + perceptual face signature is stored — the signature
            powers the privacy gate so family members never trigger recording.
          </p>

          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <Btn variant="ghost" onClick={() => fileRef.current?.click()}><ImageIcon size={14} /> Upload photo</Btn>
            <Btn variant="ghost" onClick={webcamOn ? captureFromWebcam : startWebcamEnroll}>
              {webcamOn ? "📸 Capture frame" : "Use webcam"}
            </Btn>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && processPhoto(e.target.files[0])} />
            <video ref={videoRef} className={webcamOn ? "sm:col-span-2 w-full rounded-xl border-2 border-cyan-200" : "hidden"} playsInline muted />
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            {previewPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewPhoto} alt="preview" className="h-16 w-16 rounded-xl object-cover border-2 border-cyan-300" />
            ) : (
              <div className="h-16 w-16 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 grid place-items-center"><Fingerprint size={20} className="text-slate-300" /></div>
            )}
            <div className="flex-1 grid grid-cols-2 gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <select value={relation} onChange={(e) => setRelation(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {RELATIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <Btn onClick={enrollUploaded} disabled={!previewFace || !name.trim() || busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Enroll
            </Btn>
          </div>

          {/* vault list */}
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-3">
              <Users size={15} className="text-cyan-700" />
              <h3 className="font-bold text-slate-900 text-sm">Vault ({members.length})</h3>
              <span className="chip bg-cyan-50 text-cyan-700 border border-cyan-200 text-[10px]">signature-matched</span>
            </div>
            {members.length === 0 ? (
              <p className="text-xs text-slate-400">Vault empty — until family is enrolled here, every detected face is treated as a stranger.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.photo} alt={m.name} className="h-12 w-12 rounded-xl object-cover border border-slate-200" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate">{m.name}</div>
                      <div className="text-[11px] text-slate-500 capitalize">{m.relation}</div>
                      <div className="text-[9px] mono text-slate-400 truncate">sha256 {m.photoHash.slice(0, 16)}…</div>
                    </div>
                    <button onClick={() => removeMember(m)} className="text-slate-300 hover:text-rose-600 p-1"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* privacy gate explainer */}
        <div className="space-y-4">
          <div className="card p-5 border-2 border-cyan-200">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck size={16} className="text-cyan-700" />
              <h3 className="font-extrabold text-slate-900 text-sm">How the privacy gate works</h3>
            </div>
            <ol className="text-xs text-slate-600 space-y-2 list-decimal ml-4 leading-relaxed">
              <li>Every 10s the Detection Lab hashes + posts the current frame to the Recording Booth.</li>
              <li>The backend crops each detected face and matches it against <span className="font-bold">this vault</span>.</li>
              <li>Best-match similarity ≥ <span className="mono font-bold">0.82</span> → classified <span className="text-lime-700 font-bold">FAMILY</span>.</li>
              <li>If <span className="font-bold text-rose-600">every face is family</span> → the frame is <span className="font-bold">NOT stored</span> (video suppressed).</li>
              <li>If <span className="font-bold">any stranger</span> is present → the frame is stored, hashed (SHA-256) and visible in the booth.</li>
            </ol>
          </div>
          <div className="card p-5">
            <h3 className="font-extrabold text-slate-900 text-sm mb-3">Booth stats</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Heartbeats seen</span><span className="mono font-bold">{stats?.total ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Stored</span><span className="mono font-bold text-lime-700">{stats?.kept ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Suppressed (family only)</span><span className="mono font-bold text-amber-600">{stats?.skippedPrivate ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Last capture</span><span className="mono text-xs">{stats?.lastAt ? new Date(stats.lastAt).toLocaleTimeString() : "—"}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
