import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";
import { DashboardLayout } from "../../layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { useLeave } from "../../context/LeaveContext";
import { getDaysInMonth, getFirstDayOfMonth, getMonthName, toInputDate } from "../../utils/dateUtils";
import { calendarService } from "../../services/calendarService";
import { holidayService } from "../../services/holidayService";
import { flexiHolidayService, type FlexiHolidayItem } from "../../services/flexiHolidayService";

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type DaySummary = {
  date: string;
  total: number;
  cappedTotal: number;
  shown: Array<{ userId: string; name: string; leaveType: string; status: string }>;
};

type DayDetails = {
  total: number;
  items: Array<{
    userId: string;
    name: string;
    leaveType: string;
    leaveTypeName: string;
    status: string;
    department: string;
    startDate: string;
    endDate: string;
  }>;
};

const rolePrefix = (role: string) => {
  const key = String(role || "").toUpperCase();
  if (key === "HR_ADMIN") return "/hr";
  if (key === "MANAGER") return "/manager";
  if (key === "INTERN") return "/intern";
  return "/employee";
};

export default function TeamCalendar() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { allUsers, fetchUsers } = useLeave();
  const roleKey = String(currentUser?.role || "").toUpperCase();

  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string>("ALL");
  const [holidays, setHolidays] = useState<Array<{ date: string; title: string }>>([]);
  const [flexiHolidays, setFlexiHolidays] = useState<FlexiHolidayItem[]>([]);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [holidayStatus, setHolidayStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);
  const [summaryByDate, setSummaryByDate] = useState<Record<string, DaySummary>>({});
  const [selectedDayDetails, setSelectedDayDetails] = useState<DayDetails | null>(null);

  const isHRAdmin = roleKey === "HR_ADMIN";
  const isManager = roleKey === "MANAGER";
  const isEmployee = roleKey === "EMPLOYEE" || roleKey === "INTERN";

  useEffect(() => {
    if (!currentUser || (roleKey !== "HR_ADMIN" && roleKey !== "MANAGER")) return;
    fetchUsers().catch(() => undefined);
  }, [currentUser?._id, roleKey, fetchUsers]);

  const monthRange = useMemo(() => {
    const start = toInputDate(new Date(year, month, 1));
    const end = toInputDate(new Date(year, month + 1, 0));
    return { start, end };
  }, [year, month]);

  useEffect(() => {
    if (!currentUser) return;
    const loadSummary = async () => {
      setLoadingSummary(true);
      try {
        const res = await calendarService.getLeaveSummary({
          start: monthRange.start,
          end: monthRange.end,
          ...(isHRAdmin && departmentFilter !== "ALL" ? { department: departmentFilter } : {}),
        });
        const map: Record<string, DaySummary> = {};
        for (const day of res?.data?.days || []) {
          map[day.date] = day;
        }
        setSummaryByDate(map);
      } catch (err) {
        console.error("Failed to load calendar summary:", err);
        setSummaryByDate({});
      } finally {
        setLoadingSummary(false);
      }
    };
    loadSummary();
  }, [currentUser?._id, monthRange.start, monthRange.end, isHRAdmin, departmentFilter]);

  useEffect(() => {
    if (!currentUser) return;
    const loadHolidays = async () => {
      try {
        const [holidayResponse, flexiResponse] = await Promise.all([
          holidayService.list({ start: monthRange.start, end: monthRange.end }),
          flexiHolidayService.list({ start: monthRange.start, end: monthRange.end }),
        ]);
        setHolidays(holidayResponse?.items || []);
        setFlexiHolidays(flexiResponse?.items || []);
      } catch (error) {
        console.error("Failed to load holidays:", error);
        setHolidays([]);
        setFlexiHolidays([]);
      }
    };
    loadHolidays();
  }, [currentUser?._id, monthRange.start, monthRange.end]);

  useEffect(() => {
    if (!selectedDay) {
      setSelectedDayDetails(null);
      return;
    }
    const loadDetails = async () => {
      setLoadingDay(true);
      try {
        const res = await calendarService.getLeavesByDate(selectedDay, {
          limit: 2000,
          page: 1,
          ...(isHRAdmin && departmentFilter !== "ALL" ? { department: departmentFilter } : {}),
        });
        setSelectedDayDetails({
          total: res?.data?.total || 0,
          items: res?.data?.items || [],
        });
      } catch (err) {
        console.error("Failed to load selected day details:", err);
        setSelectedDayDetails({ total: 0, items: [] });
      } finally {
        setLoadingDay(false);
      }
    };
    loadDetails();
  }, [selectedDay, isHRAdmin, departmentFilter]);

  if (!currentUser) return null;

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const holidaySet = new Set((holidays || []).map((h) => h.date));
  const flexiHolidayMap = new Map((flexiHolidays || []).map((h) => [h.date, h]));
  const departments = [...new Set(allUsers.map((u: any) => u.department).filter(Boolean))].sort();

  const navigateMonth = (dir: 1 | -1) => {
    let m = month + dir;
    let y = year;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    setMonth(m);
    setYear(y);
    setSelectedDay(null);
  };

  const openDateDetailsPage = (date: string) => {
    navigate(`${rolePrefix(roleKey)}/calendar/leaves/${date}`);
  };

  const saveHoliday = async () => {
    const date = String(holidayDate || "").trim();
    const title = String(holidayName || "").trim();
    setHolidayStatus(null);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setHolidayStatus({ type: "error", text: "Please select a valid date." });
      return;
    }
    if (!title) {
      setHolidayStatus({ type: "error", text: "Please enter a holiday name." });
      return;
    }

    try {
      setHolidaySaving(true);
      await holidayService.upsert({ date, title });
      const refreshed = await holidayService.list({ start: monthRange.start, end: monthRange.end });
      setHolidays(refreshed?.items || []);
      setHolidayDate("");
      setHolidayName("");
      setHolidayStatus({ type: "success", text: "Holiday saved successfully." });
    } catch (error: any) {
      const message = error?.response?.data?.message || "Failed to save holiday.";
      setHolidayStatus({ type: "error", text: message });
    } finally {
      setHolidaySaving(false);
    }
  };

  const monthStats = useMemo(() => {
    const entries = Object.values(summaryByDate);
    return {
      activeDates: entries.length,
      totalApplicants: entries.reduce((sum, d) => sum + d.total, 0),
      cappedApplicants: entries.reduce((sum, d) => sum + Math.min(d.total, 30), 0),
    };
  }, [summaryByDate]);

  return (
    <DashboardLayout
      title={isHRAdmin ? "System Calendar" : isEmployee ? "My Leave Calendar" : "Team Calendar"}
      subtitle={isHRAdmin ? "Organization leave overview by date range" : isEmployee ? "Your leave applications calendar" : `${currentUser.department} leave overview`}
      allowedRoles={["EMPLOYEE", "INTERN", "MANAGER", "HR_ADMIN"]}
    >
      {isHRAdmin && (
        <div className="mb-5 bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-gray-700">Filter by Department:</label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white"
            >
              <option value="ALL">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative">
          {loadingSummary && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-medium text-gray-600">Loading calendar...</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <button onClick={() => navigateMonth(-1)} className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <h2 className="font-bold text-gray-900 text-lg">{getMonthName(month)} {year}</h2>
            <button onClick={() => navigateMonth(1)} className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          <div className="grid grid-cols-7 border-b border-gray-100">
            {days.map((d) => (
              <div key={d} className={`py-3 text-center text-xs font-bold ${d === "Sun" || d === "Sat" ? "text-gray-400" : "text-gray-700"}`}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {[...Array(firstDay)].map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[108px] border-r border-b border-gray-50" />
            ))}
            {[...Array(daysInMonth)].map((_, i) => {
              const day = i + 1;
              const dateStr = toInputDate(new Date(year, month, day));
              const dayData = summaryByDate[dateStr];
              const shown = dayData?.shown || [];
              const cappedTotal = Math.min(dayData?.total || 0, 30);
              const overflow = Math.max(0, cappedTotal - 5);
              const dayOfWeek = (firstDay + i) % 7;
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const isToday = dateStr === toInputDate(new Date());
              const isSelected = selectedDay === dateStr;
              const isHoliday = holidaySet.has(dateStr);
              const flexiHoliday = flexiHolidayMap.get(dateStr);
              const hasFlexiLeave = shown.some((entry) => entry.leaveType === "FLEXI");

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                  className={`min-h-[108px] p-1.5 border-r border-b border-gray-50 cursor-pointer transition-colors ${isWeekend ? "bg-gray-50/50" : "bg-white hover:bg-blue-50/30"} ${isHoliday ? "bg-red-50/60" : ""} ${flexiHoliday ? "bg-violet-50/70" : ""} ${isSelected ? "bg-blue-50 ring-2 ring-blue-400 ring-inset" : ""}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mx-auto mb-1 ${isToday ? "bg-[#1E3A8A] text-white" : isWeekend ? "text-gray-400" : "text-gray-700"}`}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {shown.slice(0, 5).map((entry, idx) => (
                      <p key={`${dateStr}-${entry.userId}-${idx}`} className={`text-[10px] truncate ${entry.leaveType === 'LOP' ? 'text-red-600 font-bold' : 'text-gray-700'}`} title={`${entry.name} (${entry.leaveType}) - ${entry.status}`}>
                        • {entry.name} ({entry.leaveType})
                      </p>
                    ))}
                    {overflow > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDateDetailsPage(dateStr);
                        }}
                        className="inline-flex items-center gap-1 text-[10px] text-blue-700 font-semibold hover:underline"
                      >
                        +{overflow} more <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                    {isHoliday && <p className="text-[9px] text-red-600 text-center font-semibold">Holiday</p>}
                    {flexiHoliday && <p className="text-[9px] text-violet-700 text-center font-semibold">{hasFlexiLeave ? "Flexi Leave / Holiday" : "Flexi Holiday"}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {selectedDay && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-3 text-sm">
                {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
              </h3>
              {loadingDay ? (
                <p className="text-xs text-gray-500">Loading day details...</p>
              ) : (selectedDayDetails?.items || []).length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">No leave applications on this day</p>
                  {flexiHolidayMap.get(selectedDay) && (
                    <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
                      <p className="text-xs font-semibold text-violet-900">{flexiHolidayMap.get(selectedDay)?.title}</p>
                      <p className="text-[11px] text-violet-700">Approved Flexi Holiday</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto">
                  {selectedDayDetails?.items?.slice(0, 30).map((item, idx) => (
                    <div key={`${item.userId}-${idx}`} className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-600">{item.leaveTypeName} ({item.leaveType})</p>
                      <p className="text-[10px] text-gray-500">{item.status} • {item.department}</p>
                    </div>
                  ))}
                  {(selectedDayDetails?.total || 0) > 30 && (
                    <button onClick={() => openDateDetailsPage(selectedDay)} className="text-xs text-blue-700 font-semibold hover:underline">
                      View full list ({selectedDayDetails?.total})
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-3 text-sm">This Month</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-gray-500">Dates with Applications</span><span className="font-bold text-gray-900">{monthStats.activeDates}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total Applicants</span><span className="font-bold text-gray-900">{monthStats.totalApplicants}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Calendar Capped Count</span><span className="font-bold text-gray-900">{monthStats.cappedApplicants}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Flexi Holidays</span><span className="font-bold text-violet-700">{flexiHolidays.length}</span></div>
            </div>
          </div>

          {flexiHolidays.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-3 text-sm">Approved Flexi Holidays</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {flexiHolidays.map((holiday) => (
                  <div key={holiday.date} className="rounded-lg border border-violet-100 bg-violet-50/70 px-3 py-2">
                    <p className="text-xs font-semibold text-gray-900">{holiday.title}</p>
                    <p className="text-[11px] text-violet-700">{holiday.date} • {holiday.day}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isHRAdmin && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-3 text-sm">Calendar Admin</h3>
              <div className="space-y-2">
                <input
                  type="date"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  placeholder="Holiday name"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
                <button
                  onClick={saveHoliday}
                  disabled={holidaySaving}
                  className="w-full py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {holidaySaving ? "Saving..." : "Add / Update Holiday"}
                </button>
                {holidayStatus && (
                  <p className={`text-xs ${holidayStatus.type === "success" ? "text-green-600" : "text-red-600"}`}>
                    {holidayStatus.text}
                  </p>
                )}
              </div>
              <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
                {(holidays || []).slice(0, 8).map((h) => (
                  <div key={h.date} className="text-xs text-gray-600 flex justify-between">
                    <span>{h.date}</span>
                    <span>{h.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
