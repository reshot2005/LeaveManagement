const POLICY = {
  LEAVE_TYPES: {
    EARNED: {
      name: "Earned Leave",
      code: "EL",
      description: "Accrued monthly leave for planned time off.",
      accrualType: "MONTHLY",
      accrualRate: 1.25,
      annualEntitlement: 15,
      carryForwardLimit: 30,
      maxConsecutiveDays: 30,
      maxBalance: 45, // carry forward (30) + current-year credits (15)
    },
    SICK: {
      name: "Sick Leave",
      code: "SL",
      accrualType: "MONTHLY",
      accrualRate: 1,
      annualEntitlement: 12,
      carryForwardLimit: 0,
      maxBalance: 12,
    },
    LOP: {
      name: "LOP",
      code: "LOP",
      description: "Additional Leave (LOP) for extra time off.",
      accrualType: "NONE",
      accrualRate: 0,
      annualEntitlement: 0,
      carryForwardLimit: 0,
      maxConsecutiveDays: 365,
      allowNegativeBalance: true,
    },
  },
  CONVERSION: {
    TO_EARNED: {
      CL: 15,
      SL: 12,
    },
  },
  INTERN: {
    earnedAccrualPerMonth: 1,
    sickAccrualPerMonth: 0,
  },
  JOINING_MONTH_AFTER_15TH: {
    earnedAccrual: 1,
    sickAccrual: 0,
  },
};

module.exports = POLICY;
