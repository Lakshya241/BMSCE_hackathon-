import { FamilyVault } from "@/components/FamilyVault";

export default function FamilyPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Family Face Vault</h1>
        <p className="text-sm text-slate-500">
          The only place family photos live. Faces are matched live by the Detection Lab —
          family members never trigger recording; strangers do.
        </p>
      </div>
      <FamilyVault />
    </div>
  );
}
