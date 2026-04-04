const test = require("node:test");
const assert = require("node:assert/strict");

const {
  FLEXI_HOLIDAYS_2026,
  FLEXI_LEAVE_CODE,
  getFlexiLimitForRole,
} = require("../services/flexiHolidayService");

test("flexi leave code and approved 2026 dates are defined", () => {
  assert.equal(FLEXI_LEAVE_CODE, "FLEXI");
  assert.equal(FLEXI_HOLIDAYS_2026.length, 9);
  assert.deepEqual(
    FLEXI_HOLIDAYS_2026.map((item) => item.date),
    [
      "2026-01-14",
      "2026-01-15",
      "2026-03-19",
      "2026-03-20",
      "2026-04-03",
      "2026-05-27",
      "2026-08-28",
      "2026-09-14",
      "2026-10-20",
    ]
  );
});

test("flexi leave limit differs by role", () => {
  assert.equal(getFlexiLimitForRole("EMPLOYEE"), 2);
  assert.equal(getFlexiLimitForRole("MANAGER"), 2);
  assert.equal(getFlexiLimitForRole("INTERN"), 1);
});
