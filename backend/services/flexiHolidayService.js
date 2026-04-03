const FlexiHoliday = require("../models/FlexiHoliday");

const FLEXI_LEAVE_CODE = "FLEXI";
const FLEXI_HOLIDAY_LABEL = "Flexi Holiday";
const FLEXI_LIMITS = {
  EMPLOYEE: 2,
  INTERN: 1,
};

const FLEXI_HOLIDAYS_2026 = [
  { title: "Sankranti (Makar Sankranti)", date: "2026-01-14", day: "Wednesday", active: true },
  { title: "Ugadi (Telugu/Kannada New Year)", date: "2026-03-19", day: "Thursday", active: true },
  { title: "Eid al-Fitr (Ramzan Id)", date: "2026-03-20", day: "Friday", active: true },
  { title: "Good Friday", date: "2026-04-03", day: "Friday", active: true },
  { title: "Eid al-Adha (Bakrid)", date: "2026-05-27", day: "Wednesday", active: true },
  { title: "Varamahalakshmi Vrat", date: "2026-08-28", day: "Friday", active: true },
  { title: "Ganesh Festival (Ganesh Chaturthi)", date: "2026-09-14", day: "Monday", active: true },
  { title: "Dussehra (Vijayadashami)", date: "2026-10-20", day: "Tuesday", active: true },
];

let seedPromise = null;

async function ensureFlexiHolidaysSeeded() {
  if (!seedPromise) {
    seedPromise = (async () => {
      for (const holiday of FLEXI_HOLIDAYS_2026) {
        await FlexiHoliday.findOneAndUpdate(
          { date: holiday.date },
          { $set: holiday },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    })().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }

  await seedPromise;
}

async function listActiveFlexiHolidays(filter = {}) {
  await ensureFlexiHolidaysSeeded();

  const query = { active: true, ...filter };
  return FlexiHoliday.find(query).sort({ date: 1 }).lean();
}

async function getFlexiHolidayByDate(date) {
  await ensureFlexiHolidaysSeeded();
  return FlexiHoliday.findOne({ date, active: true }).lean();
}

function getFlexiLimitForRole(role) {
  return role === "INTERN" ? FLEXI_LIMITS.INTERN : FLEXI_LIMITS.EMPLOYEE;
}

module.exports = {
  FLEXI_HOLIDAY_LABEL,
  FLEXI_HOLIDAYS_2026,
  FLEXI_LEAVE_CODE,
  FLEXI_LIMITS,
  ensureFlexiHolidaysSeeded,
  getFlexiHolidayByDate,
  getFlexiLimitForRole,
  listActiveFlexiHolidays,
};
