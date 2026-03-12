const mongoose = require("mongoose");

const holidaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD
    name: { type: String, required: true, trim: true },
    isWorkingDayOverride: { type: Boolean, default: false },
  },
  { _id: false }
);

const calendarConfigSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Default Calendar", required: true },
    weekendDays: { type: [Number], default: [0] }, // 0 Sunday only; Saturday (6) is a working day
    holidays: { type: [holidaySchema], default: [] },
    monthlyCreditDay: { type: Number, default: 1, min: 1, max: 28 },
    timezone: { type: String, default: "Asia/Kolkata" },
    monthlyAccrualPolicy: {
      employee: {
        earned: { type: Number, default: 1.25 },
        sick: { type: Number, default: 1 },
      },
      intern: {
        earned: { type: Number, default: 1 },
        sick: { type: Number, default: 0 },
      },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

calendarConfigSchema.index({ isActive: 1 });

module.exports = mongoose.model("CalendarConfig", calendarConfigSchema);
