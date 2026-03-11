import React, { useState } from "react";
import { CheckCircle, XCircle, Search, Filter, MessageSquare, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { DashboardLayout } from "../../layouts/DashboardLayout";
import { LeaveStatusBadge } from "../../components/LeaveStatusBadge";
import { Modal } from "../../components/Modal";
import { useAuth } from "../../context/AuthContext";
import { dateRangeLabel, formatDate, formatDateTime } from "../../utils/dateUtils";
import { useLeave, LeaveRequest } from "../../context/LeaveContext";
import { toast } from "sonner";

export default function TeamRequests() {
  const { currentUser } = useAuth();
  const { leaveRequests, allUsers, approveLeave, rejectLeave, refreshAllData } = useLeave();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [rejectModal, setRejectModal] = useState<LeaveRequest | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [approveComment, setApproveComment] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Auto-refresh every 30 seconds
  React.useEffect(() => {
    const interval = setInterval(() => {
      console.log("TeamRequests - Auto-refreshing data");
      refreshAllData();
    }, 30000); // 30 seconds

    // Listen for leave data updates from other components
    const handleLeaveUpdate = () => {
      console.log("TeamRequests - Received leaveDataUpdated event, refreshing...");
      refreshAllData();
    };
    
    window.addEventListener('leaveDataUpdated', handleLeaveUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('leaveDataUpdated', handleLeaveUpdate);
    };
  }, [refreshAllData]);

  // Debug logging
  console.log("TeamRequests - Current User:", currentUser);
  console.log("TeamRequests - Leave Requests:", leaveRequests);
  console.log("TeamRequests - All Users:", allUsers);

  if (!currentUser) return null;
  const currentUserId = currentUser._id;

  const teamMembers = allUsers.filter((u) => u.managerId === currentUserId || (u as any).managerId?._id === currentUserId);
  const teamIds = teamMembers.map((u) => u.id || u._id).filter(Boolean);
  const teamRequests = leaveRequests.filter((r) => r.employeeId && teamIds.includes(r.employeeId));

  const filtered = teamRequests.filter((r) => {
    const matchSearch = (r.employeeName?.toLowerCase() || "").includes(search.toLowerCase()) || (r.leaveTypeName?.toLowerCase() || "").includes(search.toLowerCase());
    const matchStatus = statusFilter === "ALL" || r.status === statusFilter;
    return matchSearch && matchStatus;
  }).sort((a, b) => {
    if (a.status === "PENDING" && b.status !== "PENDING") return -1;
    if (b.status === "PENDING" && a.status !== "PENDING") return 1;
    if (a.status === "HR_PENDING" && b.status !== "HR_PENDING") return -1;
    if (b.status === "HR_PENDING" && a.status !== "HR_PENDING") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const counts = { ALL: teamRequests.length, PENDING: teamRequests.filter(r => r.status === "PENDING").length, HR_PENDING: teamRequests.filter(r => r.status === "HR_PENDING").length, APPROVED: teamRequests.filter(r => r.status === "APPROVED").length, REJECTED: teamRequests.filter(r => r.status === "REJECTED").length };

  const handleApprove = async (r: LeaveRequest) => {
    try {
      const requestId = r._id;
      console.log("=== APPROVE FLOW START ===");
      console.log("Request ID:", requestId);
      console.log("Comment:", approveComment || "Approved");
      console.log("Current User:", currentUser);
      
      const result = await approveLeave(requestId, approveComment || "Approved");
      
      console.log("=== APPROVE RESULT ===");
      console.log("Result:", result);
      
      if (result.success) {
        toast.success(result.message || "Leave request approved successfully!");
        setSelectedRequest(null);
        setApproveComment("");
      } else {
        toast.error(result.message || "Failed to approve leave request.");
      }
    } catch (error: any) {
      console.error("=== APPROVE ERROR ===");
      console.error("Error object:", error);
      console.error("Error response:", error?.response);
      console.error("Error data:", error?.response?.data);
      
      const errorMessage = error?.response?.data?.message || error?.message || "Failed to approve leave request. Please try again.";
      toast.error(errorMessage);
    }
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectComment.trim()) {
      toast.error("Please provide a rejection reason.");
      return;
    }
    
    try {
      const requestId = rejectModal._id;
      console.log("=== REJECT FLOW START ===");
      console.log("Request ID:", requestId);
      console.log("Comment:", rejectComment);
      console.log("Current User:", currentUser);
      
      const result = await rejectLeave(requestId, rejectComment);
      
      console.log("=== REJECT RESULT ===");
      console.log("Result:", result);
      
      if (result.success) {
        toast.success(result.message || "Leave request rejected successfully!");
        setRejectModal(null);
        setRejectComment("");
      } else {
        toast.error(result.message || "Failed to reject leave request.");
      }
    } catch (error: any) {
      console.error("=== REJECT ERROR ===");
      console.error("Error object:", error);
      console.error("Error response:", error?.response);
      console.error("Error data:", error?.response?.data);
      
      const errorMessage = error?.response?.data?.message || error?.message || "Failed to reject leave request. Please try again.";
      toast.error(errorMessage);
    }
  };

  const statusTabs = ["ALL", "PENDING", "HR_PENDING", "APPROVED", "REJECTED"];

  return (
    <DashboardLayout title="Team Leave Requests" subtitle="Review and manage your team's leave applications" allowedRoles={["MANAGER", "HR_ADMIN"]}>
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl mb-5 w-fit">
        {statusTabs.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${statusFilter === s ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
            {s} <span className="ml-1 text-xs font-normal text-gray-400">({counts[s as keyof typeof counts]})</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or leave type..."
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 bg-white" />
        </div>
      </div>

      {/* Requests */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-gray-400">
          <Filter className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p className="font-medium">No requests found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const member = allUsers.find(u => u.id === r.employeeId || u._id === r.employeeId);
            const requestId = r.id || r._id;
            const isExpanded = expandedId === requestId;
            const requestRole = String(member?.role || (r as any).employee?.role || "").toUpperCase();
            const isInternRequest = requestRole === "INTERN";
            const needsHrApproval = isInternRequest && r.status === "HR_PENDING";
            return (
              <div key={requestId} className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all ${r.status === "PENDING" ? "border-amber-200" : "border-gray-100"}`}>
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {member?.avatar || "?"}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{r.employeeName}</p>
                      {member?.probationStatus && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Probation</span>}
                      <span className="text-gray-300">·</span>
                      <p className="text-xs text-gray-500">{r.department}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs font-bold text-white px-2 py-0.5 rounded-full" style={{ backgroundColor: r.leaveTypeColor }}>{r.leaveTypeCode}</span>
                      <span className="text-xs text-gray-500">{dateRangeLabel(r.fromDate, r.toDate)}</span>
                      <span className="text-xs font-bold text-gray-700">{r.totalDays} day{r.totalDays !== 1 ? "s" : ""}</span>
                      {r.halfDay && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">{r.halfDaySession} Half</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{r.reason}</p>
                  </div>

                  {/* Applied date */}
                  <div className="hidden md:block text-xs text-gray-400 text-right flex-shrink-0">
                    <p>Applied</p>
                    <p className="font-medium text-gray-600">{formatDate(r.createdAt)}</p>
                  </div>

                  {/* Balance info */}
                  {member && (
                    <div className="hidden lg:block text-xs text-right flex-shrink-0">
                      <p className="text-gray-400">Balance</p>
                      <p className={`font-bold ${(() => {
                        const balEntry = member.leaveBalances?.find((b: any) => (b.leaveTypeId === r.leaveTypeId || b.leaveTypeId?._id === r.leaveTypeId || b.leaveTypeId?.toString() === r.leaveTypeId));
                        const balance = balEntry?.balance ?? 0;
                        return balance < r.totalDays ? "text-red-500" : "text-green-600";
                      })()}`}>
                        {(() => {
                          const balEntry = member.leaveBalances?.find((b: any) => (b.leaveTypeId === r.leaveTypeId || b.leaveTypeId?._id === r.leaveTypeId || b.leaveTypeId?.toString() === r.leaveTypeId));
                          return balEntry?.balance ?? 0;
                        })()} {r.leaveTypeCode}
                      </p>
                    </div>
                  )}

                  {/* Status */}
                  <LeaveStatusBadge status={r.status} />

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setExpandedId(isExpanded ? null : requestId)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {r.status === "PENDING" && !isInternRequest && (
                      <>
                        <button onClick={() => { setSelectedRequest(r); }}
                          className="flex items-center gap-1.5 text-xs font-semibold bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-xl hover:bg-green-100 transition-colors">
                          <CheckCircle className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button onClick={() => { setRejectModal(r); setRejectComment(""); }}
                          className="flex items-center gap-1.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-xl hover:bg-red-100 transition-colors">
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    )}
                    {needsHrApproval && (
                      <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-xl">
                        HR Approval Required
                      </span>
                    )}
                    <button onClick={() => setSelectedRequest(r)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded reason */}
                {isExpanded && (
                  <div className="px-5 pb-4 border-t border-gray-50">
                    <p className="text-xs font-semibold text-gray-500 mb-1.5 mt-3 uppercase tracking-wide">Reason</p>
                    <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">{r.reason}</p>
                    {r.comments && (
                      <><p className="text-xs font-semibold text-gray-500 mb-1.5 mt-3 uppercase tracking-wide">Comments</p>
                        <p className="text-sm text-gray-700 bg-red-50 rounded-xl p-3">{r.comments}</p></>
                    )}
                    {r.approvalHistory.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Approval History</p>
                        {r.approvalHistory.map((step, i) => (
                          <div key={i} className={`text-xs p-2 rounded-lg mb-1 ${step.status === "APPROVED" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                            <span className="font-bold">{step.approverName}</span>: {step.status} {step.comment ? `— "${step.comment}"` : ""} {step.actionDate ? `(${formatDate(step.actionDate)})` : ""}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Approve Modal */}
      <Modal isOpen={!!selectedRequest && selectedRequest.status === "PENDING"} onClose={() => { setSelectedRequest(null); setApproveComment(""); }} title="Approve Leave Request" size="md">
        {selectedRequest && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-100 rounded-xl p-4">
              <p className="font-bold text-green-900">{selectedRequest.employeeName}</p>
              <p className="text-sm text-green-700">{selectedRequest.leaveTypeName} · {dateRangeLabel(selectedRequest.fromDate, selectedRequest.toDate)} · {selectedRequest.totalDays} day{selectedRequest.totalDays !== 1 ? "s" : ""}</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Comment (optional)</label>
              <textarea value={approveComment} onChange={(e) => setApproveComment(e.target.value)}
                placeholder="Add an approval comment..." rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500 resize-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setSelectedRequest(null); setApproveComment(""); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleApprove(selectedRequest!)} className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" /> Confirm Approval
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal isOpen={!!rejectModal} onClose={() => { setRejectModal(null); setRejectComment(""); }} title="Reject Leave Request" size="md">
        {rejectModal && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
              <p className="font-bold text-red-900">{rejectModal.employeeName}</p>
              <p className="text-sm text-red-700">{rejectModal.leaveTypeName} · {dateRangeLabel(rejectModal.fromDate, rejectModal.toDate)} · {rejectModal.totalDays} day{rejectModal.totalDays !== 1 ? "s" : ""}</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Rejection Reason <span className="text-red-500">*</span>
                <span className="text-gray-400 font-normal ml-1">(required)</span>
              </label>
              <textarea value={rejectComment} onChange={(e) => setRejectComment(e.target.value)}
                placeholder="Please provide a clear reason for rejection. This will be shared with the employee." rows={4}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 resize-none" required />
              <p className="text-xs text-gray-400 mt-1">{rejectComment.length}/300</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setRejectModal(null); setRejectComment(""); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleReject} disabled={!rejectComment.trim()}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                <XCircle className="w-4 h-4" /> Confirm Rejection
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* View Detail Modal */}
      {selectedRequest && selectedRequest.status !== "PENDING" && (
        <Modal isOpen={true} onClose={() => setSelectedRequest(null)} title="Request Details" size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Employee", selectedRequest.employeeName],
                ["Department", selectedRequest.department],
                ["Leave Type", selectedRequest.leaveTypeName],
                ["Duration", `${selectedRequest.totalDays} day(s)`],
                ["From", formatDate(selectedRequest.fromDate)],
                ["To", formatDate(selectedRequest.toDate)],
                ["Applied On", formatDateTime(selectedRequest.createdAt)],
                ["Status", selectedRequest.status],
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
                <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Comments</p>
                <p className="text-sm text-gray-700 bg-red-50 rounded-xl p-3">{selectedRequest.comments}</p>
              </div>
            )}
            {selectedRequest.approvalHistory && selectedRequest.approvalHistory.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Approval History</p>
                <div className="space-y-2">
                  {selectedRequest.approvalHistory.map((step: any, i: number) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${step.status === "APPROVED" ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${step.status === "APPROVED" ? "bg-green-500" : "bg-red-500"}`}>{step.level || i + 1}</div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900">{step.approverName}</p>
                        <p className={`text-xs font-medium ${step.status === "APPROVED" ? "text-green-700" : "text-red-700"}`}>{step.status} by {step.approverRole}</p>
                        {step.comment && <p className="text-xs text-gray-600 mt-1">"{step.comment}"</p>}
                        {step.actionDate && <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(step.actionDate)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </DashboardLayout>
  );
}

