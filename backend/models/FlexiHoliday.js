const mongoose = require("mongoose");

const flexiHolidaySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    date: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"],
    },
    day: { type: String, required: true, trim: true, maxlength: 20 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

flexiHolidaySchema.index({ date: 1 }, { unique: true });

module.exports = mongoose.model("FlexiHoliday", flexiHolidaySchema);
