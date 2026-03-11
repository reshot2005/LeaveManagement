import React from "react";
import { Info } from "lucide-react";
import { DashboardLayout } from "../../layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { useLeave } from "../../context/LeaveContext";
import { formatDays } from "../../utils/formatDays";

export default function LeaveBalance() {
  const { currentUser, leaveBalances, creditInfo, balanceSummary } = useAuth();
  const { leaveRequests, leaveTypes } = useLeave();
  if (!currentUser) return null;

  const currentUserId = (currentUser as any)._id || (currentUser as any).id;
  const myRequests = leaveRequests.filter((r) => r.employeeId === currentUserId);

  const leaveTypeMeta = new Map((leaveTypes || []).map((lt: any) => [String(lt.code || "").toUpperCase(), lt]));

  const balanceData = leaveBalances
    .filter((lb) => String(lb.leaveType.code || "").toUpperCase() !== "CL")
    .map((lb) => {
      const code = String(lb.leaveType.code || "").toUpperCase();
      const remaining = Number(lb.balance || 0);
      const used = Number(lb.used || 0);
      const pending = Number(lb.pending || 0);
      const total = Number((lb as any).total ?? remaining + used);
      const pct = total > 0 ? Math.round((remaining / total) * 100) : 100;
      const meta = leaveTypeMeta.get(code);
      const yearlyTotal =
        Number(lb.leaveType.yearlyTotal || 0) ||
        (code === "EL" ? 15 : lb.leaveType.accrualType === "MONTHLY" ? Number(lb.leaveType.accrualRate || 0) * 12 : Number(lb.leaveType.accrualRate || 0));

      return {
        id: lb.leaveType._id,
        code,
        name: lb.leaveType.name,
        color: lb.leaveType.color,
        accrualRate: Number(lb.leaveType.accrualRate || 0),
        accrualType: String(lb.leaveType.accrualType || "YEARLY").toUpperCase(),
        used,
        remaining,
        pending,
        total,
        pct,
        yearlyTotal,
        carryForwardLimit: Number(lb.leaveType.carryForwardLimit ?? meta?.carryForwardLimit ?? 0),
        maxConsecutiveDays: Number(lb.leaveType.maxConsecutiveDays ?? meta?.maxConsecutiveDays ?? 30),
        applicableDuringProbation: true,
      };
    });

  return (
    <DashboardLayout title="Leave Balance" subtitle="Your current leave entitlements and usage" allowedRoles={["EMPLOYEE", "INTERN", "MANAGER", "HR_ADMIN"]}>
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Entitled", value: balanceData.filter(b => b.code !== "LOP").reduce((s, b) => s + b.total, 0), color: "border-blue-500", icon: "??" },
          { label: "Used", value: balanceData.filter(b => b.code !== "LOP").reduce((s, b) => s + b.used, 0), color: "border-amber-500", icon: "??" },
          { label: "Remaining", value: balanceData.filter(b => b.code !== "LOP").reduce((s, b) => s + b.remaining, 0), color: "border-green-500", icon: "?" },
        ].map((s) => (
          <div key={s.label} className={`bg-white rounded-2xl shadow-sm border border-gray-100 border-l-4 ${s.color} p-5`}>
            <p className="text-sm text-gray-500">{s.icon} {s.label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">days</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="py-2 pr-4">Balance Field</th>
              <th className="py-2 pr-4">Display Name</th>
              <th className="py-2">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-50">
              <td className="py-2 pr-4 font-mono text-xs text-gray-600">earned_leave</td>
              <td className="py-2 pr-4 font-semibold text-gray-900">Earned Leave</td>
              <td className="py-2 font-bold text-blue-700">{formatDays(balanceSummary.earned_leave)}</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-2 pr-4 font-mono text-xs text-gray-600">sick_leave</td>
              <td className="py-2 pr-4 font-semibold text-gray-900">Sick Leave</td>
              <td className="py-2 font-bold text-emerald-700">{formatDays(balanceSummary.sick_leave)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {balanceData.map((b) => (
          <div key={b.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <div className="h-1.5 w-full" style={{ backgroundColor: b.color }} />
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="inline-block text-white text-[10px] tracking-wider uppercase font-black px-2.5 py-1 rounded-full mb-2 shadow-sm" style={{ backgroundColor: b.color }}>
                    {b.code === "LOP" ? "Additional Leave" : b.code}
                  </span>
                  <h3 className="text-base font-bold text-gray-900 leading-tight">{b.name}</h3>
                  {b.code === "LOP" && <p className="text-xs font-semibold text-gray-500 mb-1">LOP</p>}
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black" style={{ color: b.code === "LOP" ? "#64748B" : (b.remaining <= 2 ? "#EF4444" : "#1E293B") }}>
                    {b.code === "LOP" ? b.used : b.remaining}
                  </p>
                  <p className="text-xs text-gray-400">{b.code === "LOP" ? "Used" : "Remaining"}</p>
                </div>
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Used: {formatDays(b.used)}</span>
                  {b.code !== "LOP" && <span>Total: {formatDays(b.total)}</span>}
                </div>
                {b.code !== "LOP" ? (
                  <>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${100 - b.pct}%`, backgroundColor: b.color, opacity: 0.7 }} />
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <span style={{ color: b.color }} className="font-medium">{100 - b.pct}% used</span>
                      <span className="text-gray-400">{b.pct}% remaining</span>
                    </div>
                  </>
                ) : (
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden opacity-30" />
                )}
              </div>

              <div className="space-y-1.5 text-xs text-gray-500 border-t border-gray-50 pt-3">
                <div className="flex justify-between">
                  <span>Accrual</span>
                  <span className="font-medium text-gray-700">
                    {b.code === "EL" ? formatDays(b.yearlyTotal, "/year") : formatDays(b.accrualRate, b.accrualType === "YEARLY" ? "/year" : "/month")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Carry Forward</span>
                  <span className="font-medium text-gray-700">{formatDays(b.carryForwardLimit)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Consecutive</span>
                  <span className="font-medium text-gray-700">{formatDays(b.maxConsecutiveDays)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Used</span>
                  <span className="font-medium text-gray-700">{formatDays(b.used)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pending</span>
                  <span className="font-medium text-gray-700">{formatDays(b.pending)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Remaining</span>
                  <span className="font-medium text-gray-700">
                    {b.code === "LOP" ? "N/A" : formatDays(b.remaining)}
                  </span>
                </div>
                {currentUser.probationStatus && !b.applicableDuringProbation && (
                  <div className="mt-2 bg-amber-50 text-amber-700 px-2 py-1 rounded-lg text-xs font-medium">
                    Not available during probation
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-blue-900 text-sm mb-2">Leave Policy Highlights</h4>
            <ul className="space-y-1 text-xs text-blue-700">
              {currentUser.role === 'intern' || currentUser.role === 'INTERN' ? (
                <>
                  <li>• Earned Leave accrues monthly at {formatDays(1, "/month")} ({formatDays(12, "/year")}).</li>
                  <li>• Sick Leave is not provided for interns ({formatDays(0, "/month")}).</li>
                </>
              ) : (
                <>
                  <li>• Earned Leave accrues monthly at {formatDays(1.25, "/month")} ({formatDays(15, "/year")}), with carry forward capped at {formatDays(30)}.</li>
                  <li>• Sick Leave accrues monthly at {formatDays(1, "/month")} ({formatDays(12, "/year")}).</li>
                </>
              )}
              {creditInfo?.lastCreditedMonth && <li>• Last credited month: {creditInfo.lastCreditedMonth}</li>}
              {creditInfo?.nextCreditDate && <li>• Next credit date: {new Date(creditInfo.nextCreditDate).toISOString().slice(0, 10)}</li>}
              {currentUser.probationStatus && <li className="text-amber-700 font-medium">• You are currently in the probation period. Earned Leave is not applicable.</li>}
            </ul>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
