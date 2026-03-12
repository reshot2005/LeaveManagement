const CalendarConfig = require("../models/CalendarConfig");

async function getActiveCalendar() {
  let calendar = await CalendarConfig.findOne({ isActive: true }).sort({ updatedAt: -1 });
  if (!calendar) {
    calendar = await CalendarConfig.create({
      name: "Default Calendar",
      weekendDays: [0], // Saturday (6) is a working day; only Sunday (0) is a weekend
      holidays: [],
      isActive: true,
    });
  }
  return calendar;
}

function toDateKey(date) {
  return new Date(date).toISOString().split("T")[0];
}

async function calculateWorkingDaysWithCalendar(startDate, endDate, options = {}) {
  const { excludeWeekends = true, excludePublicHolidays = true } = options;
  const calendar = await getActiveCalendar();
  const weekendDays = new Set(calendar.weekendDays || [0]); // Saturday (6) is a working day; only Sunday (0) is a weekend
  const holidayMap = new Map(
    (calendar.holidays || []).map((h) => [h.date, Boolean(h.isWorkingDayOverride)])
  );

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end < start) return 0;

  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const key = toDateKey(cur);
    const day = cur.getDay();
    const isWeekend = excludeWeekends && weekendDays.has(day);
    const isHoliday = excludePublicHolidays && holidayMap.has(key) && !holidayMap.get(key);
    const isWorkingOverride = holidayMap.get(key) === true;

    if ((!isWeekend && !isHoliday) || isWorkingOverride) {
      count += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return count;
}

module.exports = {
  getActiveCalendar,
  calculateWorkingDaysWithCalendar,
};
