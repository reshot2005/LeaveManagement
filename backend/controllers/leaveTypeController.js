const LeaveType = require("../models/LeaveType");
const AuditTrail = require("../models/AuditTrail");
const { AppError } = require("../middleware/errorHandler");
const POLICY = require("../config/policy");
const xss = require("xss");

const CORE_POLICIES = {
  EL: {
    name: "Earned Leave",
    code: "EL",
    color: "#10B981",
    description: "Accrued monthly leave for planned time off",
    accrualType: "MONTHLY",
    accrualRate: POLICY.LEAVE_TYPES.EARNED.accrualRate,
    accrualPerMonth: POLICY.LEAVE_TYPES.EARNED.accrualRate,
    yearlyTotal: POLICY.LEAVE_TYPES.EARNED.annualEntitlement,
    carryForwardLimit: POLICY.LEAVE_TYPES.EARNED.carryForwardLimit,
    maxConsecutiveDays: POLICY.LEAVE_TYPES.EARNED.maxConsecutiveDays,
    applicableDuringProbation: true,
    isActive: true,
  },
  SL: {
    name: "Sick Leave",
    code: "SL",
    color: "#EF4444",
    description: "For medical reasons",
    accrualType: "MONTHLY",
    accrualRate: POLICY.LEAVE_TYPES.SICK.accrualRate,
    accrualPerMonth: POLICY.LEAVE_TYPES.SICK.accrualRate,
    yearlyTotal: POLICY.LEAVE_TYPES.SICK.annualEntitlement,
    carryForwardLimit: 0,
    maxConsecutiveDays: 30,
    isActive: true,
  },
  LOP: {
    name: "Loss of Pay",
    code: "LOP",
    color: "#64748B",
    description: "Loss of Pay (LOP) for extra time off",
    accrualType: "NONE",
    accrualRate: 0,
    accrualPerMonth: 0,
    yearlyTotal: 0,
    carryForwardLimit: 0,
    maxConsecutiveDays: 365,
    allowNegativeBalance: true,
    applicableDuringProbation: true,
    isActive: true,
  },
};

const normalizeLeaveTypePayload = (leaveType) => {
  const doc = leaveType?.toObject ? leaveType.toObject() : leaveType;
  const accrualType = String(doc?.accrualType || "").toUpperCase();
  const accrualPerMonth = Number(doc?.accrualPerMonth ?? (accrualType === "MONTHLY" ? doc?.accrualRate : 0) ?? 0);
  const yearlyTotal = Number(doc?.yearlyTotal ?? (accrualType === "MONTHLY" ? accrualPerMonth * 12 : doc?.accrualRate) ?? 0);
  return {
    ...doc,
    code: String(doc?.code || "").toUpperCase(),
    isActive: doc?.isActive !== false,
    active: doc?.isActive !== false,
    accrualPerMonth,
    yearlyTotal,
    accrualPerYear: yearlyTotal,
    maxConsecutive: Number(doc?.maxConsecutiveDays ?? 30),
  };
};

async function ensureCoreLeaveTypes() {
  const [earned, sick, casual, lop] = await Promise.all([
    LeaveType.findOne({ code: "EL" }),
    LeaveType.findOne({ code: "SL" }),
    LeaveType.findOne({ code: "CL" }),
    LeaveType.findOne({ code: "LOP" }),
  ]);

  if (!earned) {
    await LeaveType.create({
      ...CORE_POLICIES.EL,
      allowNegativeBalance: false,
      requiresDocument: false,
    });
  } else {
    Object.assign(earned, CORE_POLICIES.EL);
    await earned.save();
  }

  if (!sick) {
    await LeaveType.create({
      ...CORE_POLICIES.SL,
      allowNegativeBalance: false,
      applicableDuringProbation: true,
      requiresDocument: true,
      documentRequiredAfterDays: 3,
    });
  } else {
    Object.assign(sick, CORE_POLICIES.SL);
    await sick.save();
  }

  if (!lop) {
    await LeaveType.create({
      ...CORE_POLICIES.LOP,
    });
  } else {
    Object.assign(lop, CORE_POLICIES.LOP);
    await lop.save();
  }

  if (casual) {
    casual.isActive = false;
    casual.accrualType = "NONE";
    casual.accrualRate = 0;
    casual.accrualPerMonth = 0;
    casual.yearlyTotal = 0;
    casual.carryForwardLimit = 0;
    await casual.save();
  }
}

/**
 * GET /api/leave-types — Get all leave types
 */
exports.getAllLeaveTypes = async (req, res, next) => {
  try {
    await ensureCoreLeaveTypes();
    const { isActive } = req.query;
    const query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === "true";
      if (query.isActive) {
        query.code = { $ne: "CL" };
      }
    }

    const leaveTypes = await LeaveType.find(query).sort({ displayOrder: 1, name: 1 });
    const normalizedLeaveTypes = leaveTypes.map(normalizeLeaveTypePayload);

    res.json({ success: true, count: normalizedLeaveTypes.length, data: { leaveTypes: normalizedLeaveTypes } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/leave-types/:id — Get leave type by ID
 */
exports.getLeaveTypeById = async (req, res, next) => {
  try {
    const leaveType = await LeaveType.findById(req.params.id);
    if (!leaveType) return next(new AppError("Leave type not found.", 404));

    res.json({ success: true, data: { leaveType } });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/leave-types — Create leave type (HR only)
 */
exports.createLeaveType = async (req, res, next) => {
  try {
    const {
      name,
      code,
      description,
      accrualType,
      accrualRate,
      carryForwardLimit,
      maxConsecutiveDays,
      allowNegativeBalance,
      applicableDuringProbation,
      requiresDocument,
      color,
      displayOrder,
    } = req.body;

    const existing = await LeaveType.findOne({ $or: [{ name }, { code }] });
    if (existing) return next(new AppError("Leave type with this name or code already exists.", 409));

    const leaveType = await LeaveType.create({
      name: xss(name.trim()),
      code: code.trim().toUpperCase(),
      description: description ? xss(description.trim()) : "",
      accrualType,
      accrualRate,
      accrualPerMonth: accrualType === "MONTHLY" ? accrualRate : 0,
      yearlyTotal: accrualType === "MONTHLY" ? accrualRate * 12 : accrualRate,
      carryForwardLimit: carryForwardLimit || 0,
      maxConsecutiveDays: maxConsecutiveDays || 365,
      allowNegativeBalance: allowNegativeBalance || false,
      applicableDuringProbation: applicableDuringProbation || false,
      requiresDocument: requiresDocument || false,
      color: color || "#3B82F6",
      displayOrder: displayOrder || 0,
    });

    await AuditTrail.log({
      action: "Leave Type Created",
      category: "POLICY",
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      target: `${leaveType.name} (${leaveType.code})`,
      targetId: leaveType._id,
      targetModel: "LeaveType",
      metadata: { accrualType, accrualRate },
    });

    res.status(201).json({ success: true, message: "Leave type created successfully.", data: { leaveType } });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/leave-types/:id — Update leave type
 */
exports.updateLeaveType = async (req, res, next) => {
  try {
    const leaveType = await LeaveType.findById(req.params.id);
    if (!leaveType) return next(new AppError("Leave type not found.", 404));

    const allowedFields = [
      "name", "description", "accrualRate", "carryForwardLimit", "maxConsecutiveDays",
      "allowNegativeBalance", "applicableDuringProbation", "requiresDocument", "color", "displayOrder", "isActive",
      "yearlyTotal", "accrualPerMonth",
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) leaveType[field] = req.body[field];
    });

    if (leaveType.code === "EL") {
      leaveType.name = "Earned Leave";
      leaveType.description = "Accrued monthly leave for planned time off";
      leaveType.accrualType = "MONTHLY";
      leaveType.accrualRate = 1.25;
      leaveType.accrualPerMonth = 1.25;
      leaveType.yearlyTotal = 15;
      leaveType.carryForwardLimit = 30;
      leaveType.maxConsecutiveDays = 30;
      leaveType.applicableDuringProbation = true;
      leaveType.isActive = true;
    } else if (leaveType.code === "SL") {
      leaveType.name = "Sick Leave";
      leaveType.description = "For medical reasons";
      leaveType.accrualType = "MONTHLY";
      leaveType.accrualRate = 1;
      leaveType.accrualPerMonth = 1;
      leaveType.yearlyTotal = 12;
      leaveType.carryForwardLimit = 0;
      leaveType.maxConsecutiveDays = 30;
      leaveType.isActive = true;
    } else if (leaveType.code === "CL") {
      leaveType.isActive = false;
    }

    await leaveType.save();

    await AuditTrail.log({
      action: "Leave Type Updated",
      category: "POLICY",
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      target: `${leaveType.name} (${leaveType.code})`,
      targetId: leaveType._id,
      targetModel: "LeaveType",
      metadata: { changes: req.body },
    });

    res.json({ success: true, message: "Leave type updated successfully.", data: { leaveType } });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/leave-types/:id — Delete leave type
 */
exports.deleteLeaveType = async (req, res, next) => {
  try {
    const leaveType = await LeaveType.findById(req.params.id);
    if (!leaveType) return next(new AppError("Leave type not found.", 404));

    await leaveType.deleteOne();

    await AuditTrail.log({
      action: "Leave Type Deleted",
      category: "POLICY",
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      target: `${leaveType.name} (${leaveType.code})`,
      severity: "HIGH",
    });

    res.json({ success: true, message: "Leave type deleted successfully." });
  } catch (err) {
    next(err);
  }
};
