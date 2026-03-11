import React, { useEffect } from "react";
import { Link } from "react-router";
import { FilePlus, Clock, CheckCircle, XCircle, Calendar, TrendingUp, AlertCircle } from "lucide-react";
import { DashboardLayout } from "../../layouts/DashboardLayout";
import { StatCard } from "../../components/StatCard";
import { LeaveStatusBadge } from "../../components/LeaveStatusBadge";
import { useAuth } from "../../context/AuthContext";
import { useLeave } from "../../context/LeaveContext";
import { formatDate, dateRangeLabel } from "../../utils/dateUtils";

export default function EmployeeDashboard() {
  const { currentUser, leaveBalances } = useAuth();
  const { leaveRequests, leaveTypes, isLoading, refreshAllData } = useLeave();

  // Ensure data is loaded when component mounts
  useEffect(() => {
    if (leaveRequests.length === 0 && !isLoading) {
      console.log("EmployeeDashboard - No data found, triggering refresh");
      refreshAllData();
    }
  }, []); // Only run once on mount

  // Listen for leave data updates
  useEffect(() => {
    const handleLeaveUpdate = () => {
      console.log("EmployeeDashboard - Received leaveDataUpdated event, refreshing...");
      refreshAllData();
    };
    
    const handleBalanceUpdate = () => {
      console.log("EmployeeDashboard - Received refreshBalances event, refreshing...");
      refreshAllData();
    };
    
    window.addEventListener('leaveDataUpdated', handleLeaveUpdate);
    window.addEventListener('refreshBalances', handleBalanceUpdate);
    
    return () => {
      window.removeEventListener('leaveDataUpdated', handleLeaveUpdate);
      window.removeEventListener('refreshBalances', handleBalanceUpdate);
    };
  }, [refreshAllData]);

  // Re-render when leave data changes
  useEffect(() => {
    console.log("EmployeeDashboard - Leave data updated, dashboard will re-render");
    console.log("EmployeeDashboard - Total requests:", leaveRequests.length);
  }, [leaveRequests]);

  if (!currentUser) return null;

  // Show loading state while data is being fetched
  if (isLoading) {
    return (
      <DashboardLayout
        title={`Welcome back, ${currentUser.name.split(" ")[0]}! 👋`}
        subtitle={`${currentUser.designation} · ${currentUser.department}`}
        allowedRoles={["EMPLOYEE", "INTERN", "MANAGER", "HR_ADMIN"]}
      >
        <div className="animate-in fade-in duration-300">
          {/* Loading skeleton for stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-32 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-3"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
          
          {/* Loading skeleton for content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 h-64 animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-gray-100 rounded-xl"></div>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-5">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 h-48 animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-2/3"></div>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const myRequests = leaveRequests.filter((r) => {
    const userId = currentUser._id;
    return r.employeeId === userId || r.employee?._id === userId || r.employee?.id === userId;
  });
  
  console.log("EmployeeDashboard - Current User ID:", currentUser._id);
  console.log("EmployeeDashboard - Total Leave Requests:", leaveRequests.length);
  console.log("EmployeeDashboard - My Requests:", myRequests.length);
  
  const pending = myRequests.filter((r) => r.status === "PENDING" || r.status === "HR_PENDING").length;
  const approved = myRequests.filter((r) => r.status === "APPROVED").length;
  const rejected = myRequests.filter((r) => r.status === "REJECTED").length;
  const totalDaysUsed = myRequests.filter((r) => r.status === "APPROVED").reduce((s, r) => s + r.totalDays, 0);
  const recent = [...myRequests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  // Use dynamic balances from API
  const balances = leaveBalances
    .filter((lb) => lb.leaveType.code !== "CL")
    .map((lb) => ({
    id: lb.leaveType._id,
    code: lb.leaveType.code,
    name: lb.leaveType.name,
    color: lb.leaveType.color,
    balance: lb.balance,
    used: lb.used,
    pending: lb.pending,
    available: lb.available,
    accrualRate: lb.leaveType.accrualRate,
    accrualType: lb.leaveType.accrualType,
    yearlyTotal: lb.leaveType.yearlyTotal || 0,
  }));

  const accrualLabel = (b: any) => {
    if (b.code === "EL") return `${b.yearlyTotal || 15}/yr`;
    if (b.code === "LOP") return "No Limit";
    return `${b.accrualRate}/${b.accrualType === "YEARLY" ? "yr" : "mo"}`;
  };

  const lowBalance = balances.filter((b) => b.balance <= 2);

  return (
    <DashboardLayout
      title={`Welcome back, ${currentUser.name.split(" ")[0]}! 👋`}
      subtitle={`${currentUser.designation} · ${currentUser.department}`}
      allowedRoles={["EMPLOYEE", "INTERN", "MANAGER", "HR_ADMIN"]}
    >
      {/* Low balance alert */}
      {lowBalance.length > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 mb-6 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Low leave balance: <strong>{lowBalance.map((b) => `${b.code} (${b.balance})`).join(", ")}</strong></span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Pending Requests" value={pending} subtitle="Awaiting approval" icon={Clock} iconBg="bg-amber-50" iconColor="text-amber-600" accent="border-amber-500" />
        <StatCard title="Approved Leaves" value={approved} subtitle="This year" icon={CheckCircle} iconBg="bg-green-50" iconColor="text-green-600" accent="border-green-500" />
        <StatCard title="Rejected Requests" value={rejected} subtitle="This year" icon={XCircle} iconBg="bg-red-50" iconColor="text-red-500" accent="border-red-500" />
        <StatCard title="Days Used" value={totalDaysUsed} subtitle="Approved leaves" icon={TrendingUp} iconBg="bg-blue-50" iconColor="text-blue-600" accent="border-blue-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leave Balance Cards */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Leave Balances</h2>
              <Link to="/employee/leave-balance" className="text-xs text-blue-600 hover:underline font-medium">View details →</Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {balances.length === 0 ? (
                <div className="col-span-full text-center py-4 text-gray-400 text-sm">
                  Loading balances...
                </div>
              ) : (
                balances.map((b) => (
                  <div key={b.id} className="rounded-xl border border-gray-100 p-3 hover:shadow-sm transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full text-white shadow-sm" style={{ backgroundColor: b.color }}>
                        {b.code === "LOP" ? "Additional" : b.code}
                      </span>
                      <span className="text-xs text-gray-400">{accrualLabel(b)}</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 leading-none">{b.code === "LOP" ? b.used : b.balance}</p>
                    <div className="mt-1">
                      <p className="text-xs font-bold text-gray-900 truncate">{b.name}</p>
                      {b.code === "LOP" && <p className="text-[10px] font-medium text-gray-400">LOP</p>}
                    </div>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      {b.code !== "LOP" ? (
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, (b.balance / Math.max(1, b.accrualRate)) * 100)}%`, backgroundColor: b.color }}
                        />
                      ) : (
                        <div className="h-full bg-gray-200 opacity-30" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Requests */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Recent Requests</h2>
              <Link to="/employee/leave-history" className="text-xs text-blue-600 hover:underline font-medium">View all →</Link>
            </div>
            {recent.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Calendar className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                <p className="text-sm">No leave requests yet</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {recent.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors border border-gray-50">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: r.leaveTypeColor }}>{r.leaveTypeCode}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{r.leaveTypeName}</p>
                      <p className="text-xs text-gray-400">{dateRangeLabel(r.fromDate, r.toDate)} · {r.totalDays}d</p>
                    </div>
                    <LeaveStatusBadge status={r.status} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-5">
          <div className="bg-gradient-to-br from-[#1E3A8A] to-[#3B82F6] rounded-2xl p-5 text-white shadow-md">
            <h3 className="font-bold text-base mb-1">Quick Apply</h3>
            <p className="text-blue-200 text-xs mb-4">Submit a new leave request instantly</p>
            <Link
              to="/employee/apply-leave"
              className="flex items-center justify-center gap-2 bg-white text-[#1E3A8A] font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-blue-50 transition-colors"
            >
              <FilePlus className="w-4 h-4" /> Apply for Leave
            </Link>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-3">Leave Summary</h3>
            <div className="space-y-2.5">
              {[
                { label: "Total Leaves Taken", value: totalDaysUsed, color: "text-blue-600" },
                { label: "Pending Requests", value: pending, color: "text-amber-600" },
                { label: "Approved Requests", value: approved, color: "text-green-600" },
                { label: "Rejected Requests", value: rejected, color: "text-red-500" },
              ].map((s) => (
                <div key={s.label} className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">{s.label}</span>
                  <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {currentUser.probationStatus && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-amber-800 text-sm font-semibold mb-1">⚠️ Probation Period</p>
              <p className="text-amber-700 text-xs">Some leave types (like Earned Leave) are not available during your probation period.</p>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-3">Upcoming Holidays</h3>
            {[
              { date: "Jun 19", name: "Juneteenth" },
              { date: "Jul 4", name: "Independence Day" },
              { date: "Sep 1", name: "Labor Day" },
            ].map((h) => (
              <div key={h.name} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex flex-col items-center justify-center flex-shrink-0">
                  <span className="text-[9px] text-blue-600 font-bold uppercase leading-none">{h.date.split(" ")[0]}</span>
                  <span className="text-sm font-bold text-blue-700 leading-none">{h.date.split(" ")[1]}</span>
                </div>
                <p className="text-sm text-gray-700 font-medium">{h.name}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

