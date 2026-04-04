const { AppError } = require("../middleware/errorHandler");
const FlexiHoliday = require("../models/FlexiHoliday");
const { ensureFlexiHolidaysSeeded, listActiveFlexiHolidays } = require("../services/flexiHolidayService");

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(value) {
  const text = String(value || "").trim();
  return DATE_REGEX.test(text) ? text : null;
}

function normalizeDay(value, date) {
  const raw = String(value || "").trim();
  if (raw) return raw;
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
}

exports.listFlexiHolidays = async (req, res, next) => {
  try {
    await ensureFlexiHolidaysSeeded();

    const start = String(req.query?.start || "").trim();
    const end = String(req.query?.end || "").trim();
    const includeInactive = String(req.query?.includeInactive || "").trim() === "true";
    const query = includeInactive ? {} : { active: true };

    if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      return next(new AppError("Invalid start date. Use YYYY-MM-DD.", 400));
    }
    if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return next(new AppError("Invalid end date. Use YYYY-MM-DD.", 400));
    }
    if (start && end && end < start) {
      return next(new AppError("end date cannot be before start date.", 400));
    }

    if (start || end) {
      query.date = {};
      if (start) query.date.$gte = start;
      if (end) query.date.$lte = end;
    }

    const items = includeInactive
      ? await FlexiHoliday.find(query).sort({ date: 1 }).lean()
      : await listActiveFlexiHolidays(query);
    res.json({ success: true, items });
  } catch (err) {
    next(err);
  }
};

exports.upsertFlexiHoliday = async (req, res, next) => {
  try {
    const date = normalizeDate(req.body?.date);
    const title = String(req.body?.title || "").trim();
    const active = req.body?.active !== undefined ? Boolean(req.body.active) : true;

    if (!date) return next(new AppError("Invalid date. Use YYYY-MM-DD.", 400));
    if (!title) return next(new AppError("Flexi Holiday title is required.", 400));

    const holiday = await FlexiHoliday.findOneAndUpdate(
      { date },
      {
        $set: {
          date,
          title,
          day: normalizeDay(req.body?.day, date),
          active,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, item: holiday });
  } catch (err) {
    next(err);
  }
};

exports.deleteFlexiHoliday = async (req, res, next) => {
  try {
    const date = normalizeDate(req.params?.date);
    if (!date) return next(new AppError("Invalid date. Use YYYY-MM-DD.", 400));

    const deleted = await FlexiHoliday.findOneAndDelete({ date });
    if (!deleted) return next(new AppError("Flexi Holiday not found.", 404));

    res.json({ success: true, message: "Flexi Holiday deleted successfully." });
  } catch (err) {
    next(err);
  }
};
