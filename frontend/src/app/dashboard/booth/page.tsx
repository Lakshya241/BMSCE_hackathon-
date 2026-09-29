import { RecordingBooth } from "@/components/RecordingBooth";

export default function BoothPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Recording Booth</h1>
        <p className="text-sm text-slate-500">
          Every 10 seconds the live feed is hashed and rolled into this store — but only while a
          non-family person is in frame. Privacy-gated by the Family Face Vault.
        </p>
      </div>
      <RecordingBooth />
    </div>
  );
}
