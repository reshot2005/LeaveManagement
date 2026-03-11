import React, { useEffect } from "react";
import { Link } from "react-router";
import { Users, Clock, CheckCircle, XCircle, TrendingUp } from "lucide-react";
import { DashboardLayout } from "../../layouts/DashboardLayout";
import { StatCard } from "../../components/StatCard";
import { LeaveStatusBadge } from "../../components/LeaveStatusBadge";
import { useAuth } from "../../context/AuthContext";
import { useLeave } from "../../context/LeaveContext";
import { dateRangeLabel, formatDate } from "../../utils/dateUtils";

export default function ManagerDashboard() {
  const { currentUser } = useAuth();
  const { leaveRequests, allUsers, isLoading, refreshAllData } = useLeave();
  
  // Ensure data is loaded when component mounts
  useEffect(() => {
    if ((leaveRequests.length === 0 || allUsers.length === 0) && !isLoading) {
      console.log("ManagerDashboard - No data found, triggering refresh");
      refreshAllData();
    }
  }, []); // Only run once on mount

  // Auto-refresh every 30 seconds to catch new leave requests
  useEffect(() => {
    const interval = setInterval(() => {
      console.log("ManagerDashboard - Auto-refreshing data");
      refreshAllData();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [refreshAllData]);

  // Listen for leave data updates
  useEffect(() => {
    const handleLeaveUpdate = () => {
      console.log("ManagerDashboard - Received leaveDataUpdated event, refreshing...");
      refreshAllData();
    };
    
    window.addEventListener('leaveDataUpdated', handleLeaveUpdate);
    
    return () => {
      window.removeEventListener('leaveDataUpdated', handleLeaveUpdate);
    };
  }, [refreshAllData]);
  
  if (!currentUser) return null;
  const currentUserId = currentUser._id;

  // Show loading state while data is being fetched
  if (isLoading) {
    return (
      <DashboardLayout 
        title={`Manager Dashboard`} 
        subtitle={`${currentUser.name} · ${currentUser.department}`} 
        allowedRoles={["MANAGER", "HR_ADMIN"]}
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

  const teamMembers = allUsers.filter((u) => u.managerId === currentUserId || (u as any).managerId?._id === currentUserId);
  const teamIds = teamMembers.map((u) => u.id || u._id).filter(Boolean);
  const teamRequests = leaveRequests.filter((r) => r.employeeId && teamIds.includes(r.employeeId));
  const pending = teamRequests.filter((r) => r.status === "PENDING");
  const approved = teamRequests.filter((r) => r.status === "APPROVED").length;
  const rejected = teamRequests.filter((r) => r.status === "REJECTED").length;

  // Who's on leave today
  const today = new Date().toISOString().split("T")[0];
  const onLeaveToday = teamRequests.filter((r) => r.status === "APPROVED" && today >= r.fromDate && today <= r.toDate);

  return (
    <DashboardLayout title={`Manager Dashboard`} subtitle={`${currentUser.name} · ${currentUser.department}`} allowedRoles={["MANAGER", "HR_ADMIN"]}>
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Team Size" value={teamMembers.length} subtitle="Direct reports" icon={Users} iconBg="bg-blue-50" iconColor="text-blue-600" accent="border-blue-500" />
        <StatCard title="Pending Requests" value={pending.length} subtitle="Needs your action" icon={Clock} iconBg="bg-amber-50" iconColor="text-amber-600" accent="border-amber-500" />
        <StatCard title="Approved Leaves" value={approved} subtitle="This year" icon={CheckCircle} iconBg="bg-green-50" iconColor="text-green-600" accent="border-green-500" />
        <StatCard title="Rejected Requests" value={rejected} subtitle="This year" icon={XCircle} iconBg="bg-red-50" iconColor="text-red-500" accent="border-red-500" />
      </div>

      {/* Pending Alert */}
      {pending.length > 0 && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-6">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600" />
            <div>
              <p className="font-bold text-amber-900 text-sm">{pending.length} request{pending.length > 1 ? "s" : ""} awaiting your approval</p>
              <p className="text-xs text-amber-700">Your team is waiting for your response</p>
            </div>
          </div>
          <Link to="/manager/team-requests" className="bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-amber-700 transition-colors flex-shrink-0">
            Review Now
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Requests */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Pending Requests</h2>
              <Link to="/manager/team-requests" className="text-xs text-blue-600 hover:underline font-medium">View all →</Link>
            </div>
            {pending.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <CheckCircle className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                <p className="text-sm font-medium">All caught up!</p>
                <p className="text-xs mt-1">No pending requests to review</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pending.slice(0, 4).map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-amber-100 bg-amber-50/50">
                    <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {allUsers.find(u => u.id === r.employeeId)?.avatar || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{r.employeeName}</p>
                      <p className="text-xs text-gray-500">{r.leaveTypeName} · {dateRangeLabel(r.fromDate, r.toDate)} · {r.totalDays}d</p>
                    </div>
                    <LeaveStatusBadge status={r.status} size="sm" />
                    <Link to="/manager/team-requests" className="text-xs text-blue-600 font-semibold hover:underline flex-shrink-0">Review</Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Team Leave History (recent) */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Recent Activity</h2>
            </div>
            <div className="space-y-2.5">
              {teamRequests.filter(r => r.status !== "PENDING").sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()).slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: r.leaveTypeColor }}>{r.leaveTypeCode}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{r.employeeName}</p>
                    <p className="text-xs text-gray-400">{r.leaveTypeName} · {r.totalDays}d · {formatDate(r.updatedAt || r.createdAt)}</p>
                  </div>
                  <LeaveStatusBadge status={r.status} size="sm" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-5">
          {/* On Leave Today */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-3 text-sm">On Leave Today</h3>
            {onLeaveToday.length === 0 ? (
              <p className="text-xs text-gray-400">Everyone is in today 🎉</p>
            ) : (
              <div className="space-y-2">
                {onLeaveToday.map((r) => {
                  const member = allUsers.find(u => u.id === r.employeeId);
                  return (
                    <div key={r.id} className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">{member?.avatar}</div>
                      <div>
                        <p className="text-xs font-semibold text-gray-900">{r.employeeName}</p>
                        <p className="text-xs text-gray-500">{r.leaveTypeCode}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Team Overview */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-3 text-sm">Team Overview</h3>
            <div className="space-y-2.5">
              {teamMembers.map((m) => {
                const activeReq = teamRequests.find(r => r.employeeId === m.id && r.status === "PENDING");
                return (
                  <div key={m.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${m.probationStatus ? "bg-amber-500" : "bg-blue-600"}`}>{m.avatar}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{m.name}</p>
                      <p className="text-xs text-gray-400">{m.designation}</p>
                    </div>
                    {activeReq && <span className="w-2 h-2 bg-amber-400 rounded-full" title="Pending request" />}
                    {m.probationStatus && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Probation</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Leave Summary by Type */}
          <div className="bg-gradient-to-br from-[#1E3A8A] to-[#3B82F6] rounded-2xl p-5 text-white">
            <h3 className="font-bold mb-3 text-sm">Team Leave Stats</h3>
            <div className="space-y-2">
              {[
                { label: "Total this year", value: teamRequests.length },
                { label: "Approved", value: approved },
                { label: "Pending", value: pending.length },
                { label: "Rejected", value: rejected },
              ].map((s) => (
                <div key={s.label} className="flex justify-between">
                  <span className="text-blue-200 text-xs">{s.label}</span>
                  <span className="font-bold text-sm">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

