import React, { useState } from "react";
import { Search, CheckCircle, XCircle, Filter, Eye, Download, ShieldCheck, Settings, FileText, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { DashboardLayout } from "../../layouts/DashboardLayout";
import { LeaveStatusBadge } from "../../components/LeaveStatusBadge";
import { Modal } from "../../components/Modal";
import { useLeave } from "../../context/LeaveContext";
import { useAuth } from "../../context/AuthContext";
import { leaveService } from "../../services/leaveService";
import { dateRangeLabel, formatDate, formatDateTime } from "../../utils/dateUtils";
import { toast } from "sonner";

export default function AllRequests() {
  const { leaveRequests, allUsers, leaveTypes, approveLeave, rejectLeave, fetchLeaveRequests, fetchDashboardStats, isLoading, refreshAllData } = useLeave();
  const { currentUser } = useAuth();
  const roleKey = String(currentUser?.role || "").toUpperCase();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [rejectModal, setRejectModal] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const apiBase = (import.meta as any).env.VITE_API_URL || `${window.location.origin}/api`;
  const backendBase = apiBase.replace(/\/api\/?$/, "");

  const getDocumentMeta = (leave: any) => {
    if (leave?.document?.url) {
      return {
        url: leave.document.url as string,
        name: leave.document.originalName || "Document",
      };
    }
    if (leave?.attachmentUrl) {
      return {
        url: leave.attachmentUrl as string,
        name: leave?.attachment?.fileName || "Document",
      };
    }
    return null;
  };

  const toAbsoluteDocumentUrl = (url?: string) => {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    if (url.startsWith("/")) return `${backendBase}${url}`;
    return `${backendBase}/${url}`;
  };

  // Ensure data is loaded when component mounts
  React.useEffect(() => {
    if (leaveRequests.length === 0 && !isLoading) {
      console.log("AllRequests - No data found, triggering refresh");
      refreshAllData();
    }
  }, []); // Only run once on mount

  // Auto-refresh every 30 seconds to catch new leave requests
  React.useEffect(() => {
    const interval = setInterval(() => {
      console.log("AllRequests - Auto-refreshing data");
      refreshAllData();
    }, 10000); // 10 seconds for near real-time updates

    // Listen for leave data updates from other components
    const handleLeaveUpdate = () => {
      console.log("AllRequests - Received leaveDataUpdated event, refreshing...");
      refreshAllData();
    };

    window.addEventListener('leaveDataUpdated', handleLeaveUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('leaveDataUpdated', handleLeaveUpdate);
    };
  }, [refreshAllData]);

  // Show loading state while data is being fetched
  if (isLoading) {
    return (
      <DashboardLayout title="All Leave Requests" subtitle="System-wide leave request management" allowedRoles={["HR_ADMIN", "MANAGER"]}>
        <div className="animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-500 font-medium">Loading leave requests...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Debug logging
  console.log("AllRequests - Leave Requests:", leaveRequests);
  console.log("AllRequests - All Users:", allUsers);
  console.log("AllRequests - Leave Types:", leaveTypes);

  const departments = [...new Set(leaveRequests.map(r => r.department).filter(Boolean))];

  const filtered = leaveRequests.filter(r => {
    const matchSearch = (r.employeeName?.toLowerCase() || "").includes(search.toLowerCase()) || (r.leaveTypeName?.toLowerCase() || "").includes(search.toLowerCase());
    const matchStatus = statusFilter === "ALL" || r.status === statusFilter;
    const matchDept = deptFilter === "ALL" || r.department === deptFilter;
    const matchType = typeFilter === "ALL" || r.leaveTypeId === typeFilter;
    return matchSearch && matchStatus && matchDept && matchType;
  }).sort((a, b) => {
    if (a.status === "PENDING" && b.status !== "PENDING") return -1;
    if (b.status === "PENDING" && a.status !== "PENDING") return 1;
    if (a.status === "HR_PENDING" && b.status !== "HR_PENDING") return -1;
    if (b.status === "HR_PENDING" && a.status !== "HR_PENDING") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const handleOverrideApprove = async (request: any) => {
    if (isProcessing) return;

    setIsProcessing(true);
    try {
      console.log("HR Override Approve - Request ID:", request.id || request._id);

      // Use dedicated override endpoint
      const response = await leaveService.hrOverrideLeave(
        request.id || request._id,
        'APPROVED',
        'Override approved by HR Admin'
      );

      console.log("HR Override Approve - Response:", response);

      if (response?.success !== false) {
        toast.success(response?.message || "Leave request approved successfully");
        setSelectedRequest(null);

        // Immediate refresh of all data
        await refreshAllData();

        // Trigger balance refresh for all components
        window.dispatchEvent(new CustomEvent('refreshBalances'));

        // Broadcast update to all listening components
        window.dispatchEvent(new CustomEvent('leaveDataUpdated'));
      } else {
        toast.error(response?.message || "Failed to approve leave request");
      }
    } catch (error: any) {
      console.error("Error approving leave:", error);
      const errorMsg = error.response?.data?.message || error.message || "Failed to approve leave request";
      toast.error(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOverrideReject = async () => {
    if (!rejectModal || !rejectComment.trim() || isProcessing) return;

    setIsProcessing(true);
    try {
      console.log("HR Override Reject - Request ID:", rejectModal.id || rejectModal._id);
      console.log("HR Override Reject - Comment:", rejectComment);

      // Use dedicated override endpoint
      const response = await leaveService.hrOverrideLeave(
        rejectModal.id || rejectModal._id,
        'REJECTED',
        rejectComment
      );

      console.log("HR Override Reject - Response:", response);

      if (response?.success !== false) {
        toast.success(response?.message || "Leave request rejected successfully");
        setRejectModal(null);
        setRejectComment("");

        // Immediate refresh of all data
        await refreshAllData();

        // Trigger balance refresh for all components
        window.dispatchEvent(new CustomEvent('refreshBalances'));

        // Broadcast update to all listening components
        window.dispatchEvent(new CustomEvent('leaveDataUpdated'));
      } else {
        toast.error(response?.message || "Failed to reject leave request");
      }
    } catch (error: any) {
      console.error("Error rejecting leave:", error);
      const errorMsg = error.response?.data?.message || error.message || "Failed to reject leave request";
      toast.error(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePurge = async (request: any) => {
    if (!window.confirm("Are you sure you want to PURGE this request? This is a permanent database deletion!")) return;

    setIsProcessing(true);
    try {
      const response = await leaveService.purgeLeave(request.id || request._id);
      if (response?.success !== false) {
        toast.success(response?.message || "Request purged successfully");
        await refreshAllData();
      } else {
        toast.error(response?.message || "Failed to purge request");
      }
    } catch (error: any) {
      console.error("Error purging leave:", error);
      toast.error(error.response?.data?.message || "Failed to purge request");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadCSV = () => {
    const rows = [
      ["Employee", "Dept", "Leave Type", "From", "To", "Days", "Status", "Applied On"],
      ...filtered.map(r => [
        r.employeeName || '',
        r.department || '',
        r.leaveTypeName || '',
        r.fromDate || '',
        r.toDate || '',
        (r.totalDays || 0).toString(),
        r.status || '',
        (r.createdAt || '').split("T")[0]
      ])
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `all_leave_requests_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully");
  };

  return (
    <DashboardLayout title="All Leave Requests" subtitle="System-wide leave request management" allowedRoles={["HR_ADMIN", "MANAGER"]}>
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl mb-5 w-fit flex-wrap">
        {["ALL", "PENDING", "HR_PENDING", "APPROVED", "REJECTED", "CANCELLED"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${statusFilter === s ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees or leave types..."
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500" />
        </div>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none">
          <option value="ALL">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none">
          <option value="ALL">All Types</option>
          {leaveTypes.map(lt => <option key={lt._id || lt.id} value={lt._id || lt.id}>{lt.name}</option>)}
        </select>
        <Link
          to={roleKey === "MANAGER" ? "/manager/leave-types" : "/hr/policies"}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
        >
          <Settings className="w-4 h-4" /> Manage Leave Types
        </Link>
        <button onClick={downloadCSV} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      <div className="mb-3 flex justify-between items-center">
        <span className="text-sm text-gray-500">{filtered.length} requests</span>
        {roleKey === "HR_ADMIN" && (
          <div className="flex items-center gap-2 text-xs text-purple-700 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-100">
            <CheckCircle className="w-3.5 h-3.5" /> HR Admin can override any approval decision
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Filter className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <p className="font-medium">No requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {["Employee", "Leave Type", "Duration", "Days", "Status", "Applied", "Document", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(r => (
                  <tr key={r.id || r._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {(r.employeeName || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{r.employeeName || 'N/A'}</p>
                          <p className="text-xs text-gray-400">{r.department || 'N/A'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold text-white px-2 py-1 rounded-full" style={{ backgroundColor: r.leaveTypeColor || '#3B82F6' }}>{r.leaveTypeCode || 'N/A'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{dateRangeLabel(r.fromDate, r.toDate)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900">{r.totalDays || 0}{r.halfDay ? " (½)" : ""}</td>
                    <td className="px-4 py-3"><LeaveStatusBadge status={r.status} size="sm" /></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const doc = getDocumentMeta(r);
                        if (!doc?.url) return <span className="text-xs text-gray-400">No document</span>;
                        return (
                          <a
                            href={toAbsoluteDocumentUrl(doc.url)}
                            target="_blank"
                            rel="noreferrer"
                            title={doc.name}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            View / Download
                          </a>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const rowRole = String(r.employee?.role || "").toUpperCase();
                        const isInternRequest = rowRole === "INTERN";
                        const canApprove = roleKey === "HR_ADMIN" && ["PENDING", "HR_PENDING", "REJECTED"].includes(r.status);
                        const canReject = roleKey === "HR_ADMIN" && ["PENDING", "HR_PENDING", "APPROVED"].includes(r.status);
                        return (
                          <div className="flex gap-1.5">
                            <button onClick={() => setSelectedRequest(r)} className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                            {canApprove && (
                              <button onClick={() => setSelectedRequest(r)} className="p-1.5 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 transition-colors"><CheckCircle className="w-3.5 h-3.5" /></button>
                            )}
                            {canReject && (
                              <button onClick={() => { setRejectModal(r); setRejectComment(""); }} className="p-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 transition-colors"><XCircle className="w-3.5 h-3.5" /></button>
                            )}
                            <button
                              onClick={() => handlePurge(r)}
                              className="p-1.5 rounded-lg bg-gray-900 hover:bg-black text-white transition-colors"
                              title="Purge Request (Lab Cleanup)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            {roleKey === "MANAGER" && isInternRequest && (
                              <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-1">
                                HR Required
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail/Override Modal */}
      {selectedRequest && (
        <Modal isOpen={!!selectedRequest} onClose={() => setSelectedRequest(null)} title={roleKey === "HR_ADMIN" ? "Request Details + HR Override" : "Request Details"} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Employee", selectedRequest.employeeName || 'N/A'],
                ["Department", selectedRequest.department || 'N/A'],
                ["Leave Type", selectedRequest.leaveTypeName || 'N/A'],
                ["Duration", `${selectedRequest.totalDays || 0} day(s)`],
                ["From", formatDate(selectedRequest.fromDate)],
                ["To", formatDate(selectedRequest.toDate)],
                ["Applied On", formatDateTime(selectedRequest.createdAt)],
                ["Current Status", selectedRequest.status || 'N/A']
              ].map(([k, v]) => (
                <div key={k} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500">{k}</p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5">{v}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Reason</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">{selectedRequest.reason || 'No reason provided'}</p>
            </div>
            {(() => {
              const doc = getDocumentMeta(selectedRequest);
              if (!doc?.url) return null;
              return (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Supporting Document</p>
                  <a
                    href={toAbsoluteDocumentUrl(doc.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900"
                  >
                    <FileText className="w-4 h-4" />
                    View / Download {doc.name ? `(${doc.name})` : "Document"}
                  </a>
                </div>
              );
            })()}
            {selectedRequest.comments && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Rejection Comments</p>
                <p className="text-sm text-gray-700 bg-red-50 border border-red-100 rounded-xl p-3">{selectedRequest.comments}</p>
              </div>
            )}
            {selectedRequest.approvalHistory && selectedRequest.approvalHistory.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Approval History</p>
                <div className="space-y-2">
                  {selectedRequest.approvalHistory.map((step: any, i: number) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${step.status === "APPROVED" ? "bg-green-50 border-green-100" : step.status === "REJECTED" ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${step.status === "APPROVED" ? "bg-green-500" : step.status === "REJECTED" ? "bg-red-500" : "bg-gray-500"}`}>{step.level || i + 1}</div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900">{step.approverName}</p>
                        <p className={`text-xs font-medium ${step.status === "APPROVED" ? "text-green-700" : step.status === "REJECTED" ? "text-red-700" : "text-gray-700"}`}>
                          {step.status} by {step.approverRole}
                        </p>
                        {step.comment && <p className="text-xs text-gray-600 mt-1">"{step.comment}"</p>}
                        {step.actionDate && <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(step.actionDate)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {roleKey === "HR_ADMIN" && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5" /> {String(selectedRequest?.employee?.role || "").toUpperCase() === "INTERN" ? "HR Final Approval" : "HR Admin Override"}
                </p>
                <div className="flex gap-3">
                  {["PENDING", "HR_PENDING", "REJECTED"].includes(selectedRequest.status) && (
                    <button
                      onClick={() => handleOverrideApprove(selectedRequest)}
                      disabled={isProcessing}
                      className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                      <CheckCircle className="w-4 h-4" /> {isProcessing ? 'Processing...' : 'Override Approve'}
                    </button>
                  )}
                  {["PENDING", "HR_PENDING", "APPROVED"].includes(selectedRequest.status) && (
                    <button
                      onClick={() => { setRejectModal(selectedRequest); setSelectedRequest(null); }}
                      disabled={isProcessing}
                      className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                      <XCircle className="w-4 h-4" /> Override Reject
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      <Modal isOpen={!!rejectModal} onClose={() => { setRejectModal(null); setRejectComment(""); }} title="Override Reject" size="md">
        {rejectModal && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
              <p className="font-bold text-red-900">{rejectModal.employeeName || 'N/A'} — {rejectModal.leaveTypeName || 'N/A'}</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Rejection Reason *</label>
              <textarea
                value={rejectComment}
                onChange={e => setRejectComment(e.target.value)}
                placeholder="HR rejection reason..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 resize-none"
                required
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setRejectModal(null)}
                disabled={isProcessing}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={handleOverrideReject}
                disabled={!rejectComment.trim() || isProcessing}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {isProcessing ? 'Processing...' : 'Override Reject'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
