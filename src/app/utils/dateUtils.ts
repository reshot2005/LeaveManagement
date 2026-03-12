export const calculateWorkingDays = (from: string, to: string, halfDay = false): number => {
  if (!from || !to) return 0;
  const start = new Date(from);
  const end = new Date(to);
  if (end < start) return 0;
  if (halfDay) return 0.5;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0) count++; // Saturday (6) is a working day; only Sunday (0) is skipped
    cur.setDate(cur.getDate() + 1);
  }
  return count;
};

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

export const formatDateTime = (dateStr: string): string => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const formatRelative = (dateStr: string): string => {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
};

export const getDaysInMonth = (year: number, month: number): number =>
  new Date(year, month + 1, 0).getDate();

export const getFirstDayOfMonth = (year: number, month: number): number =>
  new Date(year, month, 1).getDay();

export const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const isDateInRange = (date: string, from: string, to: string): boolean => {
  const d = new Date(date).getTime();
  return d >= new Date(from).getTime() && d <= new Date(to).getTime();
};

export const getMonthName = (month: number): string =>
  new Date(2000, month, 1).toLocaleString("en-US", { month: "long" });

export const toInputDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const getTodayStr = (): string => toInputDate(new Date());

export const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return toInputDate(d);
};

export const dateRangeLabel = (from: string, to: string): string => {
  if (from === to) return formatDate(from);
  return `${formatDate(from)} → ${formatDate(to)}`;
};
