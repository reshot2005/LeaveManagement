require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const LeaveType = require("../models/LeaveType");
const CalendarConfig = require("../models/CalendarConfig");
const POLICY = require("../config/policy");

async function upsertLeaveTypes() {
  const earnedConfig = POLICY.LEAVE_TYPES.EARNED;
  const sickConfig = POLICY.LEAVE_TYPES.SICK;

  let earned = await LeaveType.findOne({
    $or: [{ code: "EL" }, { name: /^Earned Leave$/i }],
  });
  if (!earned) {
    earned = await LeaveType.create({
      name: earnedConfig.name,
      code: "EL",
      color: "#10B981",
      description: "Accrued monthly leave for planned time off",
      accrualType: "MONTHLY",
      accrualRate: earnedConfig.accrualRate,
      accrualPerMonth: earnedConfig.accrualRate,
      yearlyTotal: earnedConfig.annualEntitlement,
      carryForwardLimit: earnedConfig.carryForwardLimit,
      allowNegativeBalance: false,
      applicableDuringProbation: true,
      maxConsecutiveDays: earnedConfig.maxConsecutiveDays,
      requiresDocument: false,
      isActive: true,
    });
    console.log("Created Earned Leave type");
  } else {
    earned.name = earnedConfig.name;
    earned.description = "Accrued monthly leave for planned time off";
    earned.accrualType = "MONTHLY";
    earned.accrualRate = earnedConfig.accrualRate;
    earned.accrualPerMonth = earnedConfig.accrualRate;
    earned.yearlyTotal = earnedConfig.annualEntitlement;
    earned.carryForwardLimit = earnedConfig.carryForwardLimit;
    earned.maxConsecutiveDays = earnedConfig.maxConsecutiveDays;
    earned.isActive = true;
    await earned.save();
    console.log("Updated Earned Leave policy");
  }

  let sick = await LeaveType.findOne({ code: "SL" });
  if (!sick) {
    sick = await LeaveType.create({
      name: sickConfig.name,
      code: "SL",
      color: "#EF4444",
      description: "For medical reasons",
      accrualType: "MONTHLY",
      accrualRate: sickConfig.accrualRate,
      accrualPerMonth: sickConfig.accrualRate,
      yearlyTotal: sickConfig.annualEntitlement,
      carryForwardLimit: 0,
      allowNegativeBalance: false,
      applicableDuringProbation: true,
      maxConsecutiveDays: 30,
      requiresDocument: true,
      documentRequiredAfterDays: 3,
      isActive: true,
    });
    console.log("Created Sick Leave type");
  } else {
    sick.name = sickConfig.name;
    sick.accrualType = "MONTHLY";
    sick.accrualRate = sickConfig.accrualRate;
    sick.accrualPerMonth = sickConfig.accrualRate;
    sick.yearlyTotal = sickConfig.annualEntitlement;
    sick.carryForwardLimit = 0;
    sick.maxConsecutiveDays = 30;
    await sick.save();
    console.log("Updated Sick Leave policy");
  }

  let casual = await LeaveType.findOne({
    $or: [{ code: "CL" }, { name: /^Casual Leave$/i }],
  });
  if (!casual) {
    casual = await LeaveType.create({
      name: "Casual Leave",
      code: "CL",
      color: "#3B82F6",
      description: "Legacy leave type. Disabled for new requests.",
      accrualType: "NONE",
      accrualRate: 0,
      accrualPerMonth: 0,
      yearlyTotal: 0,
      carryForwardLimit: 0,
      allowNegativeBalance: false,
      applicableDuringProbation: true,
      maxConsecutiveDays: 5,
      requiresDocument: false,
      isActive: false,
    });
    console.log("Created disabled legacy Casual Leave type");
  } else {
    casual.name = "Casual Leave";
    casual.description = "Legacy leave type. Disabled for new requests.";
    casual.accrualType = "NONE";
    casual.accrualRate = 0;
    casual.accrualPerMonth = 0;
    casual.yearlyTotal = 0;
    casual.carryForwardLimit = 0;
    casual.isActive = false;
    await casual.save();
    console.log("Disabled legacy Casual Leave type");
  }

  return { earned, sick, casual };
}

async function ensureCalendarConfig() {
  const existing = await CalendarConfig.findOne({ isActive: true });
  if (!existing) {
    await CalendarConfig.create({
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
    console.log("Initialized DB-driven calendar config");
  } else {
    existing.monthlyCreditDay = 1;
    existing.timezone = existing.timezone || process.env.ORG_TIMEZONE || "Asia/Kolkata";
    existing.monthlyAccrualPolicy = {
      employee: { earned: POLICY.LEAVE_TYPES.EARNED.accrualRate, sick: POLICY.LEAVE_TYPES.SICK.accrualRate },
      intern: { earned: POLICY.INTERN.earnedAccrualPerMonth, sick: POLICY.INTERN.sickAccrualPerMonth },
    };
    await existing.save();
    console.log("Updated calendar credit policy");
  }
}

async function run() {
  await connectDB();
  const { earned, sick, casual } = await upsertLeaveTypes();
  await ensureCalendarConfig();
  console.log(`Policy migration complete. EL=${earned._id} SL=${sick._id} CL=${casual._id}`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Policy migration failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
