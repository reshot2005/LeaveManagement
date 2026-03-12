const CalendarConfig = require("../models/CalendarConfig");
const DepartmentChangeRequest = require("../models/DepartmentChangeRequest");
const User = require("../models/User");
const AuditTrail = require("../models/AuditTrail");
const { AppError } = require("../middleware/errorHandler");
const { creditMonthlyLeaves } = require("../services/monthlyCredit");
const POLICY = require("../config/policy");
const { queueAdminEventNotification, sendAdminNotification } = require("../services/notificationMailer");

function devLog(message, data) {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[admin] ${message}`, data || "");
  }
}

exports.getCalendar = async (req, res, next) => {
  try {
    let calendar = await CalendarConfig.findOne({ isActive: true }).sort({ updatedAt: -1 });
    if (!calendar) {
      calendar = await CalendarConfig.create({
        name: "Default Calendar",
        weekendDays: [0], // Saturday (6) is a working day; only Sunday (0) is a weekend
        holidays: [],
        monthlyCreditDay: 1,
        timezone: process.env.ORG_TIMEZONE || "Asia/Kolkata",
        monthlyAccrualPolicy: {
          employee: { earned: POLICY.LEAVE_TYPES.EARNED.accrualRate, sick: POLICY.LEAVE_TYPES.SICK.accrualRate },
          intern: { earned: POLICY.INTERN.earnedAccrualPerMonth, sick: POLICY.INTERN.sickAccrualPerMonth },
        },
        isActive: true,
      });
    }
    res.json({
      success: true,
      data: {
        calendar,
        policy: {
          monthlyCreditDay: calendar.monthlyCreditDay || 1,
          timezone: calendar.timezone || process.env.ORG_TIMEZONE || "Asia/Kolkata",
          monthlyAccrual: calendar.monthlyAccrualPolicy || {
            employee: { earned: POLICY.LEAVE_TYPES.EARNED.accrualRate, sick: POLICY.LEAVE_TYPES.SICK.accrualRate },
            intern: { earned: POLICY.INTERN.earnedAccrualPerMonth, sick: POLICY.INTERN.sickAccrualPerMonth },
          },
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.upsertCalendar = async (req, res, next) => {
  try {
    const { name, weekendDays, holidays, monthlyCreditDay, timezone, monthlyAccrualPolicy } = req.body;
    let calendar = await CalendarConfig.findOne({ isActive: true }).sort({ updatedAt: -1 });
    if (!calendar) {
      calendar = new CalendarConfig();
    }
    if (name) calendar.name = name;
    if (Array.isArray(weekendDays)) calendar.weekendDays = weekendDays;
    if (Array.isArray(holidays)) calendar.holidays = holidays;
    if (monthlyCreditDay !== undefined) calendar.monthlyCreditDay = Number(monthlyCreditDay) || 1;
    if (timezone) calendar.timezone = timezone;
    if (monthlyAccrualPolicy) calendar.monthlyAccrualPolicy = monthlyAccrualPolicy;
    calendar.isActive = true;
    await calendar.save();

    devLog("Calendar updated", { by: req.user.email, holidays: calendar.holidays.length });

    await AuditTrail.log({
      action: "Calendar Updated",
      category: "CONFIG",
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      target: "System Calendar",
      metadata: { holidaysCount: String(calendar.holidays.length) },
    });

    queueAdminEventNotification("HOLIDAY_CALENDAR_UPDATED", {
      updateType: "Calendar Config Updated",
      holidayCount: calendar.holidays.length,
      monthlyCreditDay: calendar.monthlyCreditDay,
      timezone: calendar.timezone,
      changedBy: req.user.name,
      changedByEmail: req.user.email,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, message: "Calendar updated.", data: { calendar } });
  } catch (err) {
    next(err);
  }
};

exports.runMonthlyAccrual = async (req, res, next) => {
  try {
    const runDate = req.body?.runDate ? new Date(req.body.runDate) : new Date();
    const result = await creditMonthlyLeaves({ runDate, source: "MANUAL" });

    await AuditTrail.log({
      action: "Monthly Accrual Triggered",
      category: "SYSTEM",
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      target: `Accrual ${result.month}/${result.year}`,
      metadata: { creditedEntries: String(result.creditedEntries) },
    });

    res.json({ success: true, message: "Monthly credit completed.", data: result });
  } catch (err) {
    next(err);
  }
};

exports.testAdminEmail = async (req, res, next) => {
  try {
    const result = await sendAdminNotification(
      "Admin Test Email - Leave Management System",
      `Admin test email triggered by ${req.user.name} (${req.user.email}) at ${new Date().toISOString()}.`,
      {
        html: `
          <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:16px;color:#111827;">
            <h2>Admin Test Email</h2>
            <p>This is a test email from Leave Management System.</p>
            <p>Triggered By: ${req.user.name} (${req.user.email})</p>
            <p>Timestamp: ${new Date().toISOString()}</p>
          </div>
        `,
      }
    );

    if (!result.success && !result.skipped) {
      return next(new AppError(`Failed to send test email: ${result.error || "Unknown error"}`, 500));
    }

    return res.json({
      success: true,
      message: result.success ? "Email sent successfully" : "Email skipped due to SMTP configuration",
    });
  } catch (err) {
    next(err);
  }
};

exports.createDepartmentChangeRequest = async (req, res, next) => {
  try {
    const { userId, newDepartment, reason } = req.body;
    const user = await User.findById(userId);
    if (!user) return next(new AppError("User not found.", 404));
    if (!newDepartment || user.department === newDepartment) {
      return next(new AppError("New department must be different.", 400));
    }

    const request = await DepartmentChangeRequest.create({
      userId: user._id,
      requestedBy: req.user._id,
      oldDepartment: user.department,
      newDepartment: newDepartment.trim(),
      reason: reason?.trim() || "",
      status: "PENDING",
      departmentConfirmed: false,
    });

    await AuditTrail.log({
      action: "Department Change Requested",
      category: "USER",
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      target: `${user.name}: ${user.department} -> ${newDepartment}`,
      targetId: request._id,
      targetModel: "DepartmentChangeRequest",
    });

    res.status(201).json({ success: true, message: "Department change request created.", data: { request } });
  } catch (err) {
    next(err);
  }
};

exports.getDepartmentChangeRequests = async (req, res, next) => {
  try {
    const { canonicalRole } = require("../utils/roles");
    const role = canonicalRole(req.user.role);

    let query = {};
    if (role === "MANAGER") {
      query = { requestedBy: req.user._id };
    }

    const requests = await DepartmentChangeRequest.find(query)
      .populate("userId", "name email department role")
      .populate("requestedBy", "name email")
      .populate("confirmedBy", "name email")
      .sort({ createdAt: -1 });
    res.json({ success: true, count: requests.length, data: { requests } });
  } catch (err) {
    next(err);
  }
};

exports.confirmDepartmentChange = async (req, res, next) => {
  try {
    const request = await DepartmentChangeRequest.findById(req.params.id).populate("userId");
    if (!request) return next(new AppError("Department change request not found.", 404));
    if (request.status !== "PENDING") {
      return next(new AppError("Only pending requests can be confirmed.", 400));
    }

    const user = await User.findById(request.userId._id);
    user.department = request.newDepartment;
    await user.save();

    request.status = "CONFIRMED";
    request.departmentConfirmed = true;
    request.confirmedBy = req.user._id;
    request.confirmedAt = new Date();
    await request.save();

    await AuditTrail.log({
      action: "Department Change Confirmed",
      category: "USER",
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      target: `${user.name}: ${request.oldDepartment} -> ${request.newDepartment}`,
      targetId: request._id,
      targetModel: "DepartmentChangeRequest",
      metadata: { appliedAt: request.confirmedAt.toISOString() },
    });

    res.json({ success: true, message: "Department updated after confirmation.", data: { request } });
  } catch (err) {
    next(err);
  }
};

exports.rejectDepartmentChange = async (req, res, next) => {
  try {
    const request = await DepartmentChangeRequest.findById(req.params.id);
    if (!request) return next(new AppError("Department change request not found.", 404));
    if (request.status !== "PENDING") {
      return next(new AppError("Only pending requests can be rejected.", 400));
    }

    request.status = "REJECTED";
    request.departmentConfirmed = false;
    request.confirmedBy = req.user._id;
    request.rejectedAt = new Date();
    await request.save();

    await AuditTrail.log({
      action: "Department Change Rejected",
      category: "USER",
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      target: `Request ${request._id}`,
      targetId: request._id,
      targetModel: "DepartmentChangeRequest",
    });

    res.json({ success: true, message: "Department change request rejected.", data: { request } });
  } catch (err) {
    next(err);
  }
};
