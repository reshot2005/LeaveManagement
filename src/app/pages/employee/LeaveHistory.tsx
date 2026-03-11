import React, { useState, useEffect } from "react";
import { Search, Filter, Download, X, ChevronDown, MessageSquare } from "lucide-react";
import { DashboardLayout } from "../../layouts/DashboardLayout";
import { LeaveStatusBadge } from "../../components/LeaveStatusBadge";
import { Modal } from "../../components/Modal";
import { useAuth } from "../../context/AuthContext";
import { useLeave, LeaveRequest } from "../../context/LeaveContext";
import { formatDate, formatDateTime, dateRangeLabel } from "../../utils/dateUtils";

export default function LeaveHistory() {
  const { currentUser } = useAuth();
  const { leaveRequests, cancelLeave, fetchLeaveRequests } = useLeave();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLeaveRequests();
    }, 30000); // 30 seconds

    // Listen for leave data updates from other components
    const handleLeaveUpdate = () => {
      console.log("LeaveHistory - Received leaveDataUpdated event, refreshing...");
      fetchLeaveRequests();
    };
    
    window.addEventListener('leaveDataUpdated', handleLeaveUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('leaveDataUpdated', handleLeaveUpdate);
    };
  }, [fetchLeaveRequests]);

  // Re-render when leave data changes
  useEffect(() => {
    console.log("LeaveHistory - Leave data updated, list will re-render");
    console.log("LeaveHistory - Total requests:", leaveRequests.length);
  }, [leaveRequests]);

  if (!currentUser) return null;

  const myRequests = leaveRequests.filter((r) => {
    const userId = currentUser._id;
    return r.employeeId === userId || r.employee?._id === userId || r.employee?.id === userId;
  });
  
  console.log("LeaveHistory - Current User ID:", currentUser._id);
  console.log("LeaveHistory - Total Leave Requests:", leaveRequests.length);
  console.log("LeaveHistory - My Requests:", myRequests.length);
  
  const filtered = myRequests.filter((r) => {
    const matchSearch = (r.leaveTypeName?.toLowerCase() || "").includes(search.toLowerCase()) || (r.reason?.toLowerCase() || "").includes(search.toLowerCase());
    const matchStatus = statusFilter === "ALL" || r.status === statusFilter;
    const matchType = typeFilter === "ALL" || r.leaveTypeCode === typeFilter;
    return matchSearch && matchStatus && matchType;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const uniqueTypes = [...new Set(myRequests.map((r) => r.leaveTypeCode))];

  const handleCancel = async (id: string) => {
    try {
      const result = await cancelLeave(id);
      if (result.success) {
        setCancelConfirm(null);
      } else {
        alert(result.message || "Failed to cancel leave request.");
      }
    } catch (error: any) {
      console.error("Error cancelling leave:", error);
      alert(error?.response?.data?.message || error?.message || "Failed to cancel leave request.");
    }
  };

  const downloadCSV = () => {
    const rows = [
      ["Leave Type", "From", "To", "Days", "Status", "Reason", "Applied On"],
      ...filtered.map((r) => [r.leaveTypeName, r.fromDate, r.toDate, r.totalDays.toString(), r.status, r.reason, r.createdAt.split("T")[0]]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "my_leave_history.csv"; a.click();
  };

  return (
    <DashboardLayout title="My Leave Requests" subtitle="Track status of all your leave applications" allowedRoles={["EMPLOYEE", "INTERN", "MANAGER", "HR_ADMIN"]}>
      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by type or reason..."
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white">
          <option value="ALL">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="HR_PENDING">Waiting for HR Approval</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white">
          <option value="ALL">All Types</option>
          {uniqueTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={downloadCSV} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors flex-shrink-0">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-700">{filtered.length} request{filtered.length !== 1 ? "s" : ""} found</span>
          {(search || statusFilter !== "ALL" || typeFilter !== "ALL") && (
            <button onClick={() => { setSearch(""); setStatusFilter("ALL"); setTypeFilter("ALL"); }}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Filter className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <p className="font-medium">No leave requests found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((r) => (
              <div key={r.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: r.leaveTypeColor }}>{r.leaveTypeCode}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{r.leaveTypeName}</p>
                    {r.halfDay && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">{r.halfDaySession} Half</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{dateRangeLabel(r.fromDate, r.toDate)} · <strong>{r.totalDays} day{r.totalDays !== 1 ? "s" : ""}</strong></p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{r.reason}</p>
                </div>
                <div className="hidden md:block text-xs text-gray-400 text-right flex-shrink-0">
                  <p>Applied</p>
                  <p className="font-medium text-gray-600">{formatDate(r.createdAt)}</p>
                </div>
                <div className="flex-shrink-0"><LeaveStatusBadge status={r.status} /></div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setSelectedRequest(r)} className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">Details</button>
                  {(r.status === "PENDING" || r.status === "HR_PENDING") && (
                    <button onClick={() => setCancelConfirm(r._id)} className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">Cancel</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRequest && (
        <Modal isOpen={!!selectedRequest} onClose={() => setSelectedRequest(null)} title="Leave Request Details" size="lg">
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
              <span className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold" style={{ backgroundColor: selectedRequest.leaveTypeColor }}>{selectedRequest.leaveTypeCode}</span>
              <div>
                <h3 className="font-bold text-gray-900">{selectedRequest.leaveTypeName}</h3>
                <p className="text-sm text-gray-500">{dateRangeLabel(selectedRequest.fromDate, selectedRequest.toDate)} · {selectedRequest.totalDays} day{selectedRequest.totalDays !== 1 ? "s" : ""}</p>
              </div>
              <div className="ml-auto"><LeaveStatusBadge status={selectedRequest.status} size="lg" /></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                ["From Date", formatDate(selectedRequest.fromDate)],
                ["To Date", formatDate(selectedRequest.toDate)],
                ["Total Days", `${selectedRequest.totalDays} days`],
                ["Half Day", selectedRequest.halfDay ? `Yes (${selectedRequest.halfDaySession || ''})` : "No"],
                ["Applied On", formatDateTime(selectedRequest.createdAt)],
                ["Last Updated", formatDateTime(selectedRequest.updatedAt || selectedRequest.createdAt)],
              ].map(([k, v]) => (
                <div key={k} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500">{k}</p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5">{v}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Reason</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">{selectedRequest.reason}</p>
            </div>

            {selectedRequest.comments && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Manager Comments</p>
                <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">{selectedRequest.comments}</p>
              </div>
            )}

            {selectedRequest.approvalHistory.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Approval Trail</p>
                <div className="space-y-2">
                  {selectedRequest.approvalHistory.map((step, i) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${step.status === "APPROVED" ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${step.status === "APPROVED" ? "bg-green-500" : "bg-red-500"}`}>{step.level}</div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{step.approverName}</p>
                        <p className={`text-xs font-medium ${step.status === "APPROVED" ? "text-green-700" : "text-red-700"}`}>{step.status}</p>
                        {step.comment && <p className="text-xs text-gray-600 mt-1">"{step.comment}"</p>}
                        {step.actionDate && <p className="text-xs text-gray-400 mt-0.5">{formatDate(step.actionDate)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Cancel Confirm Modal */}
      <Modal isOpen={!!cancelConfirm} onClose={() => setCancelConfirm(null)} title="Cancel Leave Request" size="sm">
        <div className="text-center py-2">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-7 h-7 text-red-500" />
          </div>
          <p className="text-gray-700 mb-5">Are you sure you want to cancel this leave request? This action cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setCancelConfirm(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Keep Request</button>
            <button onClick={() => handleCancel(cancelConfirm!)} className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600">Yes, Cancel</button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}

