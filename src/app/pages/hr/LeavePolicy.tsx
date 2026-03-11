import React, { useMemo, useRef, useState } from "react";
import { Pencil, Save, X, ToggleLeft, ToggleRight } from "lucide-react";
import { DashboardLayout } from "../../layouts/DashboardLayout";
import { Modal } from "../../components/Modal";
import { useLeave } from "../../context/LeaveContext";

const POLICY_DEFAULTS = {
  EL: {
    name: "Earned Leave",
    code: "EL",
    color: "#10B981",
    description: "Accrued monthly leave for planned time off",
    accrualType: "MONTHLY",
    accrualRate: 1.25,
    accrualPerMonth: 1.25,
    yearlyTotal: 15,
    carryForwardLimit: 30,
    maxConsecutiveDays: 30,
    isActive: true,
  },
  SL: {
    name: "Sick Leave",
    code: "SL",
    color: "#EF4444",
    description: "For medical reasons",
    accrualType: "MONTHLY",
    accrualRate: 1,
    accrualPerMonth: 1,
    yearlyTotal: 12,
    carryForwardLimit: 0,
    maxConsecutiveDays: 30,
    isActive: true,
  },
  LOP: {
    name: "LOP",
    code: "LOP",
    color: "#6B7280",
    description: "Additional Leave (LOP) for extra time off",
    accrualType: "NONE",
    accrualRate: 0,
    accrualPerMonth: 0,
    yearlyTotal: 0,
    carryForwardLimit: 0,
    maxConsecutiveDays: 365,
    isActive: true,
  },
} as const;

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeLeaveType = (lt: any) => {
  const code = String(lt?.code || "").toUpperCase();
  const fallback = (POLICY_DEFAULTS as any)[code] || {};
  const accrualType = String(lt?.accrualType || fallback.accrualType || "YEARLY").toUpperCase();
  const accrualPerMonth = toNumber(
    lt?.accrualPerMonth ?? (accrualType === "MONTHLY" ? lt?.accrualRate : undefined) ?? fallback.accrualPerMonth,
    0
  );
  const yearlyTotal = toNumber(
    lt?.yearlyTotal ?? lt?.accrualPerYear ?? (accrualType === "MONTHLY" ? accrualPerMonth * 12 : lt?.accrualRate) ?? fallback.yearlyTotal,
    0
  );
  const carryForwardLimit = toNumber(lt?.carryForwardLimit ?? fallback.carryForwardLimit, 0);
  const maxConsecutiveDays = toNumber(lt?.maxConsecutiveDays ?? lt?.maxConsecutive ?? fallback.maxConsecutiveDays, 30);

  return {
    ...lt,
    code,
    name: lt?.name || fallback.name || "",
    color: lt?.color || fallback.color || "#3B82F6",
    description: lt?.description || fallback.description || "",
    accrualType,
    accrualRate: toNumber(lt?.accrualRate ?? accrualPerMonth, accrualPerMonth),
    accrualPerMonth,
    yearlyTotal,
    carryForwardLimit,
    maxConsecutiveDays,
    isActive: lt?.isActive !== undefined ? Boolean(lt.isActive) : lt?.active !== undefined ? Boolean(lt.active) : true,
  };
};

export default function LeavePolicy() {
  const { leaveTypes, updateLeaveType, refreshAllData } = useLeave();
  const [editingType, setEditingType] = useState<any | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [saved, setSaved] = useState(false);
  const warnedMissing = useRef<Set<string>>(new Set());

  const policyCards = useMemo(() => {
    const normalized = (leaveTypes || []).map(normalizeLeaveType);
    const filtered = normalized.filter((lt) => lt.code !== "CL" && lt.isActive !== false && (lt.code === "EL" || lt.code === "SL" || lt.code === "LOP"));
    const byCode = new Map(filtered.map((lt) => [lt.code, lt]));
    const requiredCodes: Array<"EL" | "SL" | "LOP"> = ["EL", "SL", "LOP"];

    for (const code of requiredCodes) {
      if (!byCode.has(code)) {
        if (!warnedMissing.current.has(code)) {
          console.warn(`[LeavePolicy] ${code} missing from API response. Rendering fallback policy card.`);
          warnedMissing.current.add(code);
        }
        byCode.set(code, normalizeLeaveType({ ...(POLICY_DEFAULTS as any)[code], id: `fallback-${code}` }));
      }
    }

    return requiredCodes.map((code) => byCode.get(code)!);
  }, [leaveTypes]);

  const startEdit = (lt: any) => {
    setEditingType(lt);
    setFormData({ ...lt });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!editingType) return;
    const result = await updateLeaveType(editingType._id || editingType.id, formData);
    if (result.success) {
      await refreshAllData();
      setEditingType(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      alert(result.message || "Failed to update leave type.");
    }
  };

  const Field = ({ label, field, type = "text", min, max, step }: { label: string; field: string; type?: string; min?: number; max?: number; step?: number }) => (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      <input
        type={type}
        value={(formData[field] as string | number) ?? ""}
        onChange={(e) => setFormData((p: any) => ({ ...p, [field]: type === "number" ? parseFloat(e.target.value) : e.target.value }))}
        min={min}
        max={max}
        step={step}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
      />
    </div>
  );

  const Toggle = ({ label, field, desc }: { label: string; field: "allowNegativeBalance" | "applicableDuringProbation" | "requiresDocument"; desc?: string }) => (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
      <div>
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
      <button onClick={() => setFormData((p: any) => ({ ...p, [field]: !p[field] }))} className={`transition-colors ${formData[field] ? "text-blue-600" : "text-gray-300"}`}>
        {formData[field] ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
      </button>
    </div>
  );

  const displayAccrual = (lt: any) => {
    if (lt.code === "EL" || lt.code === "SL") {
      const yearlyTotal = toNumber(lt.yearlyTotal, lt.code === "EL" ? 15 : 12);
      return `${yearlyTotal}/year`;
    }
    if (lt.accrualType === "MONTHLY") {
      return `${lt.accrualRate}/month`;
    }
    if (lt.accrualType === "YEARLY") {
      return `${lt.accrualRate}/year`;
    }
    return "N/A";
  };

  const displayDescription = (lt: any) => {
    if (lt.code === "EL") {
      return "Accrued monthly leave for planned time off";
    }
    return lt.description;
  };

  return (
    <DashboardLayout title="Leave Policies" subtitle="Configure leave types, accruals, and rules" allowedRoles={["HR_ADMIN", "MANAGER"]}>
      {saved && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 mb-5">Leave policy updated successfully.</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {policyCards.map((lt) => (
          <div key={lt._id || lt.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="h-2 w-full" style={{ backgroundColor: lt.color }} />
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className="inline-block text-white text-xs font-bold px-2.5 py-1 rounded-full mb-1.5" style={{ backgroundColor: lt.color }}>{lt.code}</span>
                  <h3 className="font-bold text-gray-900">{lt.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{displayDescription(lt)}</p>
                </div>
                <button onClick={() => startEdit(lt)} disabled={!lt._id && !lt.id}
                  title={!lt._id && !lt.id ? "Fallback policy card (API record missing)" : "Edit leave type"}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Accrual</span><span className="font-semibold text-gray-800">{displayAccrual(lt)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Carry Forward</span><span className="font-semibold text-gray-800">{lt.carryForwardLimit} days</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Max Consecutive</span><span className="font-semibold text-gray-800">{lt.maxConsecutiveDays} days</span></div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900 mb-4">Approval Workflow Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: "Single Level Approval", desc: "Manager approval is the default flow", active: true },
            { label: "HR Override Allowed", desc: "HR can approve/reject/override regardless of manager state", active: true },
          ].map((wf) => (
            <div key={wf.label} className="flex items-center justify-between p-4 rounded-xl border border-blue-200 bg-blue-50">
              <div>
                <p className="text-sm font-semibold text-gray-900">{wf.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{wf.desc}</p>
              </div>
              <div className="w-10 h-6 rounded-full flex items-center px-0.5 bg-blue-600 justify-end">
                <div className="w-5 h-5 bg-white rounded-full shadow-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal
        isOpen={!!editingType}
        onClose={() => setEditingType(null)}
        title={`Edit: ${editingType?.name}`}
        size="lg"
        footer={
          <div className="flex gap-3">
            <button onClick={() => setEditingType(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
              <X className="w-4 h-4 inline mr-1" /> Cancel
            </button>
            <button onClick={handleSave} className="flex-1 py-2.5 bg-[#1E3A8A] text-white rounded-xl text-sm font-semibold hover:bg-blue-800 flex items-center justify-center gap-2">
              <Save className="w-4 h-4" /> Save Policy
            </button>
          </div>
        }
      >
        {editingType && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Leave Type Name" field="name" />
              <Field label="Code" field="code" />
            </div>
            <Field label="Description" field="description" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Accrual Rate (days)" field="accrualRate" type="number" min={0} max={365} step={0.25} />
              <Field label="Carry Forward Limit (days)" field="carryForwardLimit" type="number" min={0} max={365} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Max Consecutive Days" field="maxConsecutiveDays" type="number" min={1} max={365} />
              <Field label="Color" field="color" type="text" />
            </div>
            <div className="space-y-2">
              <Toggle label="Allow Negative Balance" field="allowNegativeBalance" desc="Employee can apply even with zero balance" />
              <Toggle label="Applicable During Probation" field="applicableDuringProbation" desc="Probation employees can use this leave" />
              <Toggle label="Requires Document" field="requiresDocument" desc="Document is optional at submission unless explicitly required" />
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
