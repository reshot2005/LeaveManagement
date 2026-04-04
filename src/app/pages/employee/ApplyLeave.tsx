import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Send, AlertCircle, CheckCircle, Info } from "lucide-react";
import { DashboardLayout } from "../../layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { useLeave } from "../../context/LeaveContext";
import { calculateWorkingDays, getTodayStr } from "../../utils/dateUtils";
import { flexiHolidayService, type FlexiHolidayItem } from "../../services/flexiHolidayService";

type ResolvedLeaveType = {
  _id: string;
  name: string;
  code: string;
  color: string;
  allowNegativeBalance?: boolean;
  applicableDuringProbation?: boolean;
};

const FLEXI_CODE = "FLEXI";

const formatFlexiDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export default function ApplyLeave() {
  const { currentUser, leaveBalances, fetchLeaveBalances } = useAuth();
  const { leaveTypes, submitLeaveRequest, fetchLeaveTypes, fetchLeaveRequests } = useLeave();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    leaveTypeId: "",
    fromDate: "",
    toDate: "",
    halfDay: false,
    halfDaySession: "MORNING" as "MORNING" | "AFTERNOON",
    reason: "",
  });
  const [totalDays, setTotalDays] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [error, setError] = useState("");
  const [inlineInfo, setInlineInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [attachment, setAttachment] = useState<{ fileName: string; mimeType: string; size: number; base64: string } | null>(null);
  const [flexiHolidays, setFlexiHolidays] = useState<FlexiHolidayItem[]>([]);
  const lastLoadedUserIdRef = useRef<string | null>(null);

  const today = getTodayStr();
  const roleKey = String(currentUser?.role || "").toUpperCase();
  const availableTypesFromPolicy = leaveTypes.filter(
    (lt) => lt.code !== "CL" && !(Boolean(currentUser?.probationStatus) && lt.applicableDuringProbation === false)
  );

  const fallbackTypesFromBalances: ResolvedLeaveType[] = leaveBalances
    .filter((lb) => {
      const code = String(lb?.leaveType?.code || "").toUpperCase();
      return code === "EL" || code === "SL" || code === "LOP" || code === "FLEXI";
    })
    .map((lb) => ({
      _id: lb.leaveType._id,
      name: lb.leaveType.name,
      code: String(lb.leaveType.code || "").toUpperCase(),
      color: lb.leaveType.color || (String(lb.leaveType.code || "").toUpperCase() === "EL" ? "#10B981" : String(lb.leaveType.code || "").toUpperCase() === "SL" ? "#EF4444" : String(lb.leaveType.code || "").toUpperCase() === "LOP" ? "#64748B" : "#8B5CF6"),
      allowNegativeBalance: String(lb.leaveType.code || "").toUpperCase() === "LOP",
      applicableDuringProbation: true,
    }));

  const resolvedLeaveTypes: ResolvedLeaveType[] =
    availableTypesFromPolicy.length > 0 ? availableTypesFromPolicy : fallbackTypesFromBalances;

  const selectedType = resolvedLeaveTypes.find((lt) => lt._id === form.leaveTypeId);
  const selectedBalance = leaveBalances.find((lb) => lb.leaveType._id === form.leaveTypeId);
  const isFlexiSelected = selectedType?.code === FLEXI_CODE;
  const selectedFlexiHoliday = flexiHolidays.find((holiday) => holiday.date === form.fromDate);

  useEffect(() => {
    if (selectedType?.code === FLEXI_CODE && form.fromDate && form.toDate) {
      setTotalDays(form.fromDate === form.toDate ? 1 : 0);
    } else if (form.fromDate && form.toDate) {
      const days = calculateWorkingDays(form.fromDate, form.toDate, form.halfDay);
      setTotalDays(days);
    } else {
      setTotalDays(0);
    }
  }, [form.fromDate, form.toDate, form.halfDay, selectedType?.code]);

  useEffect(() => {
    if (!isFlexiSelected) {
      setInlineInfo("");
      return;
    }

    if (!form.fromDate) {
      setInlineInfo("Flexi Leave can only be applied on approved Flexi Holiday dates.");
      return;
    }

    if (!selectedFlexiHoliday) {
      setInlineInfo("Flexi Leave can only be applied on approved Flexi Holiday dates.");
      return;
    }

    setInlineInfo(`Selected Flexi Holiday: ${selectedFlexiHoliday.title} on ${formatFlexiDate(selectedFlexiHoliday.date)} (${selectedFlexiHoliday.day}).`);
  }, [form.fromDate, isFlexiSelected, selectedFlexiHoliday]);

  useEffect(() => {
    if (!isFlexiSelected) return;
    setForm((prev) => ({
      ...prev,
      halfDay: false,
      toDate: prev.fromDate || prev.toDate,
    }));
  }, [isFlexiSelected]);

  useEffect(() => {
    if (!isFlexiSelected || !form.fromDate) return;
    if (form.toDate === form.fromDate && form.halfDay === false) return;

    setForm((prev) => ({
      ...prev,
      halfDay: false,
      toDate: prev.fromDate,
    }));
  }, [form.fromDate, form.halfDay, form.toDate, isFlexiSelected]);

  useEffect(() => {
    const userId = currentUser?._id;
    if (!userId) return;
    if (lastLoadedUserIdRef.current === userId) return;
    lastLoadedUserIdRef.current = userId;

    fetchLeaveBalances();
    fetchLeaveTypes();
    fetchLeaveRequests();
    flexiHolidayService.list().then((response) => setFlexiHolidays(response.items || [])).catch(() => setFlexiHolidays([]));
  }, [currentUser?._id, fetchLeaveBalances, fetchLeaveTypes, fetchLeaveRequests]);

  if (!currentUser) return null;

  // Use available if present, fallback to balance
  const availableBalance = selectedBalance ? (selectedBalance.available ?? selectedBalance.balance) : 0;
  const totalBalance = selectedBalance ? selectedBalance.balance : 0;

  const hasEnoughBalance = Boolean(selectedType?.allowNegativeBalance) || availableBalance >= totalDays;
  const isProbationRestricted = Boolean(currentUser.probationStatus) && selectedType?.applicableDuringProbation === false;

  const handleChange = (field: string, value: string | boolean) =>
    setForm((p) => ({ ...p, [field]: value }));

  const validate = () => {
    const effectiveToDate = isFlexiSelected ? form.fromDate : form.toDate;

    if (!form.leaveTypeId) return "Please select a leave type.";
    if (!form.fromDate) return "Please select a from date.";
    if (!effectiveToDate) return "Please select a to date.";
    if (new Date(effectiveToDate) < new Date(form.fromDate)) return "To date cannot be before from date.";
    if (isFlexiSelected) {
      if (form.halfDay) return "Flexi Leave must be applied as a single full day on an approved Flexi Holiday date.";
      if (!selectedFlexiHoliday) return "Flexi Leave can only be applied on approved Flexi Holiday dates.";
    }
    if (!form.reason.trim()) return "Reason is required.";
    if (form.reason.trim().length < 10) return "Please provide a more detailed reason (min. 10 chars).";
    if (totalDays === 0) return "Selected date range has no working days.";
    if (!hasEnoughBalance && !selectedType?.allowNegativeBalance) {
      return `Insufficient ${selectedType?.code} balance. Available: ${availableBalance} days.`;
    }
    if (isProbationRestricted) return "This leave type is not available during probation period.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setLoading(true);
    setError("");

    try {
      const result = await submitLeaveRequest({
        leaveTypeId: form.leaveTypeId,
        fromDate: form.fromDate,
        toDate: form.halfDay || isFlexiSelected ? form.fromDate : form.toDate,
        halfDay: isFlexiSelected ? false : form.halfDay,
        halfDaySession: form.halfDay ? form.halfDaySession : undefined,
        reason: form.reason.trim(),
        attachment: attachment || undefined,
      });

      if (result.success) {
        setSubmitMessage(result.message || "");
        setSubmitted(true);
        const roleKey = String(currentUser.role || "").toUpperCase();
        const targetHistory = roleKey === "INTERN" ? "/intern/leave-history" : "/employee/leave-history";
        setTimeout(() => navigate(targetHistory), 2000);
      } else {
        setError(result.message || "Failed to submit leave request.");
        setLoading(false);
      }
    } catch (submitError: any) {
      console.error("Error submitting leave:", submitError);
      setError(submitError?.response?.data?.message || submitError?.message || "Failed to submit leave request.");
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <DashboardLayout title="Apply for Leave" allowedRoles={["EMPLOYEE", "INTERN", "MANAGER", "HR_ADMIN"]}>
        <div className="max-w-md mx-auto mt-16 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Request Submitted!</h2>
          <p className="text-gray-500 text-sm">{submitMessage || "Your leave request has been submitted and is awaiting approval. Redirecting..."}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Apply for Leave" subtitle="Submit a new leave request" allowedRoles={["EMPLOYEE", "INTERN", "MANAGER", "HR_ADMIN"]}>
      <div className="max-w-3xl mx-auto px-2 sm:px-0">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-[#1E3A8A] via-[#3B82F6] to-[#0EA5E9]" />
          <div className="p-4 sm:p-6">
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Leave Type *</label>
                {resolvedLeaveTypes.length === 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Leave types are not available right now. Please refresh once or contact HR.
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {resolvedLeaveTypes.map((lt) => {
                    const balanceInfo = leaveBalances.find((lb) => lb.leaveType._id === lt._id);
                    const bal = balanceInfo ? balanceInfo.balance : 0;
                    const sel = form.leaveTypeId === lt._id;
                    return (
                      <button
                        type="button"
                        key={lt._id}
                        onClick={() => handleChange("leaveTypeId", lt._id)}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${sel ? "border-blue-500 bg-blue-50" : "border-gray-100 hover:border-gray-200"}`}
                      >
                        <span className="inline-block text-[9px] font-black uppercase tracking-wider text-white px-2 py-0.5 rounded-full mb-2 shadow-sm" style={{ backgroundColor: lt.color }}>
                          {lt.code === "LOP" ? "Additional Leave" : lt.code === FLEXI_CODE ? "Flexi Holiday" : lt.code}
                        </span>
                        <p className="text-sm font-bold text-gray-900 leading-tight">{lt.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {lt.code === "LOP" ? (
                            <span className="font-semibold text-gray-400">LOP</span>
                          ) : lt.code === FLEXI_CODE ? (
                            <>Balance: <span className={`font-bold ${bal <= 0 ? "text-red-500" : "text-violet-700"}`}>{bal}</span></>
                          ) : (
                            <>Balance: <span className={`font-bold ${bal <= 2 ? "text-red-500" : "text-green-600"}`}>{bal}</span></>
                          )}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <input
                  type="checkbox"
                  id="halfDay"
                  checked={isFlexiSelected ? false : form.halfDay}
                  onChange={(e) => handleChange("halfDay", e.target.checked)}
                  disabled={isFlexiSelected}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
                <label htmlFor="halfDay" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Half Day Leave
                </label>
                {isFlexiSelected && (
                  <span className="text-xs font-medium text-violet-700 sm:ml-auto">
                    Flexi Leave must be applied for one approved full-day date per request.
                  </span>
                )}
                {form.halfDay && (
                  <select
                    value={form.halfDaySession}
                    onChange={(e) => handleChange("halfDaySession", e.target.value)}
                    className="sm:ml-auto border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none"
                  >
                    <option value="MORNING">Morning</option>
                    <option value="AFTERNOON">Afternoon</option>
                  </select>
                )}
              </div>

              {isFlexiSelected && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
                  <p className="text-sm font-semibold text-violet-900">Flexi Leave can only be applied on approved Flexi Holiday dates.</p>
                  <p className="text-xs text-violet-800 mt-1">
                    Flexi Leave uses your credited FLEXI balance. Apply on any approved Flexi Holiday date while balance is available.
                  </p>
                  {inlineInfo && <p className="text-xs text-violet-700 mt-2">{inlineInfo}</p>}
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {flexiHolidays.map((holiday) => (
                      <div key={holiday.date} className={`rounded-lg border px-3 py-2 text-xs ${holiday.date === form.fromDate ? "border-violet-400 bg-white" : "border-violet-100 bg-white/70"}`}>
                        <p className="font-semibold text-gray-900">{holiday.title}</p>
                        <p className="text-gray-600">{formatFlexiDate(holiday.date)} • {holiday.day}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">From Date *</label>
                  <input
                    type="date"
                    value={form.fromDate}
                    onChange={(e) => {
                      const newFrom = e.target.value;
                      if (isFlexiSelected) {
                        setForm((prev) => ({
                          ...prev,
                          fromDate: newFrom,
                          toDate: newFrom,
                          halfDay: false,
                        }));
                        return;
                      }

                      handleChange("fromDate", newFrom);
                      // If toDate is empty or before the new fromDate, update toDate
                      if (!form.toDate || new Date(form.toDate) < new Date(newFrom)) {
                        handleChange("toDate", newFrom);
                      }
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">{form.halfDay || isFlexiSelected ? "Date" : "To Date *"}</label>
                  <input
                    type="date"
                    value={form.halfDay || isFlexiSelected ? form.fromDate : form.toDate}
                    min={form.fromDate || undefined}
                    disabled={form.halfDay || isFlexiSelected}
                    onChange={(e) => handleChange("toDate", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:bg-gray-50"
                    required
                  />
                </div>
              </div>

              {totalDays > 0 && form.leaveTypeId && (
                <div
                  className={`flex items-start gap-2 p-3 rounded-xl text-sm transition-all ${hasEnoughBalance ? "bg-blue-50 border border-blue-100 text-blue-800" : "bg-red-50 border border-red-100 text-red-700 shadow-sm"
                    }`}
                >
                  <Info className={`w-4 h-4 mt-0.5 flex-shrink-0 ${hasEnoughBalance ? "text-blue-500" : "text-red-500"}`} />
                  <div className="flex-1">
                    <p className="font-medium">
                      {totalDays} working day{totalDays !== 1 ? "s" : ""} requested.
                    </p>
                    {selectedType && selectedType.code !== "LOP" && (
                      <p className="text-xs opacity-90 mt-0.5">
                        {selectedType.code === FLEXI_CODE ? "Credited balance" : "Balance"}: <strong>{totalBalance}</strong> days.
                        {availableBalance !== totalBalance && (
                          <> (Available: <strong>{availableBalance}</strong> days after pending requests)</>
                        )}
                      </p>
                    )}
                    {selectedType?.code === FLEXI_CODE && selectedFlexiHoliday && (
                      <p className="text-xs opacity-90 mt-1">
                        Flexi Holiday: <strong>{selectedFlexiHoliday.title}</strong> on {formatFlexiDate(selectedFlexiHoliday.date)}.
                      </p>
                    )}
                    {selectedType && selectedType.code === "LOP" && (
                      <p className="text-xs opacity-90 mt-0.5">
                        This leave will be recorded as <strong>Additional Leave (LOP)</strong>.
                      </p>
                    )}
                    {!hasEnoughBalance && (
                      <p className="font-bold mt-1 text-xs">
                        ⚠️ Insufficient {selectedType?.code || "leave"} balance!
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Reason *</label>
                <textarea
                  value={form.reason}
                  onChange={(e) => handleChange("reason", e.target.value)}
                  placeholder="Please provide a detailed reason for your leave request..."
                  rows={4}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 resize-none"
                  required
                />
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-400">Minimum 10 characters required</span>
                  <span className={`text-xs ${form.reason.length < 10 ? "text-red-400" : "text-gray-400"}`}>{form.reason.length}/500</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Supporting Document (optional)</label>
                <input
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) {
                      setAttachment(null);
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      const base64 = String(reader.result || "").split(",")[1] || "";
                      setAttachment({
                        fileName: file.name,
                        mimeType: file.type || "application/octet-stream",
                        size: file.size,
                        base64,
                      });
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                />
                {attachment && <p className="text-xs text-gray-500 mt-1">Attached: {attachment.fileName}</p>}
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || isProbationRestricted}
                  className="flex-1 px-4 py-3 bg-[#1E3A8A] hover:bg-blue-800 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Submit Request
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
