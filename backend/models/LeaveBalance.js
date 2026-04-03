const mongoose = require("mongoose");

const leaveBalanceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    leaveTypeId: { type: mongoose.Schema.Types.ObjectId, ref: "LeaveType", required: true },
    balance: { type: Number, default: 0, min: -365 },
    used: { type: Number, default: 0, min: 0 },
    pending: { type: Number, default: 0, min: 0 },
    earned_leave: { type: Number, default: 0, min: 0 },
    sick_leave: { type: Number, default: 0, min: 0 },
    casual_leave: { type: Number, default: 0, min: 0 },
    flexi_leave: { type: Number, default: 0, min: 0 },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

leaveBalanceSchema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});

leaveBalanceSchema.index({ userId: 1, leaveTypeId: 1 }, { unique: true });

module.exports = mongoose.model("LeaveBalance", leaveBalanceSchema);
