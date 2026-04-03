const express = require("express");
const { protect } = require("../middleware/auth");
const { restrictTo } = require("../middleware/roleCheck");
const { listFlexiHolidays, upsertFlexiHoliday, deleteFlexiHoliday } = require("../controllers/flexiHolidayController");

const router = express.Router();

router.use(protect);
router.get("/", restrictTo("EMPLOYEE", "INTERN", "MANAGER", "HR_ADMIN"), listFlexiHolidays);
router.post("/", restrictTo("HR_ADMIN"), upsertFlexiHoliday);
router.put("/:date", restrictTo("HR_ADMIN"), upsertFlexiHoliday);
router.delete("/:date", restrictTo("HR_ADMIN"), deleteFlexiHoliday);

module.exports = router;
