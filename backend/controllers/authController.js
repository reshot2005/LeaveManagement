const User = require("../models/User");
const AuditTrail = require("../models/AuditTrail");
const Notification = require("../models/Notification");
const { AppError } = require("../middleware/errorHandler");
const { generateToken } = require("../middleware/auth");
const { sendEmail } = require("../services/emailService");
const { queueAdminEventNotification } = require("../services/notificationMailer");
const { validationResult } = require("express-validator");
const { initializeUserBalances } = require("../services/leaveBalanceService");
const crypto = require("crypto");
const { canonicalRole, normalizeRoleForDb } = require("../utils/roles");
const { isPasswordCompromised } = require("../services/pwnedPasswordService");
const { logSecurityEvent, SECURITY_EVENTS } = require("../services/securityEventService");
const xss = require("xss");

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const sendTokenResponse = (user, statusCode, res) => {
  const token = generateToken({
    id: user._id,
    userId: user._id,
    role: user.role,
    email: user.email,
  });
  const userObj = user.toObject();
  delete userObj.password;
  delete userObj.failedLoginAttempts;
  delete userObj.lockUntil;
  userObj.role = normalizeRoleForDb(userObj.role);
  res.cookie("jwt", token, cookieOptions());
  res.status(statusCode).json({ success: true, data: { user: userObj, token } });
};

exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return next(new AppError(errors.array()[0].msg, 400));

    const { name, email, password, department, designation, phone, role } = req.body;

    if (await isPasswordCompromised(password)) {
      return next(new AppError("Password has appeared in known breaches. Choose a different password.", 400));
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return next(new AppError("Email already registered.", 409));

    // Fix 1: Sanitize input to prevent Stored XSS
    const sanitizedName = xss(name.trim());
    const sanitizedDepartment = xss(department.trim());

    // Fix 2: Hardcode role and isActive to prevent Mass Assignment/Privilege Escalation
    const user = await User.create({
      name: sanitizedName,
      email: email.toLowerCase().trim(),
      password,
      department: sanitizedDepartment,
      designation: designation?.trim() || "",
      phone: phone?.trim() || "",
      role: role === "intern" ? "intern" : "employee",
      isActive: false,
      probationStatus: true,
      probationEndDate: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000),
    });

    await initializeUserBalances(user._id);

    await AuditTrail.log({
      action: "User Registered",
      category: "AUTH",
      performedBy: user._id,
      performedByName: user.name,
      performedByRole: "USER",
      target: `${user.name} (${user.email})`,
      metadata: { department: sanitizedDepartment, role: user.role },
    });

    const hrAdmins = await User.find({ role: { $in: ["HR_ADMIN", "hr_admin", "ADMIN", "HR"] }, isActive: true });

    // Role dynamic
    const roleLabel = user.role === "intern" ? "Intern" : "Employee";

    for (const admin of hrAdmins) {
      await Notification.create({
        user: admin._id,
        message: `New ${roleLabel} registration: ${user.name} (${user.email}) - ${user.department}. Please review and activate their account.`,
        type: "INFO",
      });
    }

    const successMessage = "Registration successful. Your account will be activated by HR Admin.";

    queueAdminEventNotification("NEW_EMPLOYEE_REGISTRATION", {
      employeeName: user.name,
      employeeEmail: user.email,
      department: user.department,
      role: user.role,
      registrationTime: new Date().toISOString(),
      activationStatus: user.isActive ? "Active" : "Pending Activation",
    });

    res.status(201).json({ success: true, message: successMessage });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return next(new AppError(errors.array()[0].msg, 400));

    const normalizedEmail = String(req.body?.email || "").trim().toLowerCase();
    const rawPassword = String(req.body?.password || "");
    const trimmedPassword = rawPassword.trim();

    const user = await User.findOne({ email: normalizedEmail }).select("+password +failedLoginAttempts +lockUntil");

    if (!user) {
      logSecurityEvent(SECURITY_EVENTS.AUTH_LOGIN_FAILED, { email: normalizedEmail, reason: "user_not_found", ip: req.ip });
      if (process.env.NODE_ENV !== "production") console.log(`Login failed: User not found for ${normalizedEmail}`);
      return next(new AppError("Invalid email or password.", 401));
    }

    if (user.isAccountLocked()) {
      logSecurityEvent(SECURITY_EVENTS.AUTH_ACCOUNT_LOCKED, { email: normalizedEmail, ip: req.ip });
      return next(new AppError("Account temporarily locked after repeated login failures. Try again later.", 423));
    }

    // First try exact password, then a trimmed fallback to tolerate accidental spaces.
    let isPasswordValid = await user.comparePassword(rawPassword);

    if (!isPasswordValid && trimmedPassword !== rawPassword) {
      isPasswordValid = await user.comparePassword(trimmedPassword);
    }

    if (!isPasswordValid) {
      await user.registerFailedLogin();
      logSecurityEvent(SECURITY_EVENTS.AUTH_LOGIN_FAILED, { email: normalizedEmail, reason: "invalid_password", ip: req.ip });
      if (process.env.NODE_ENV !== "production") console.log(`Login failed: Invalid password for ${normalizedEmail}`);
      return next(new AppError("Invalid email or password.", 401));
    }
    await user.resetLoginAttempts();

    if (!user.isActive) {
      if (process.env.NODE_ENV !== "production") console.log(`Login failed: Inactive account ${normalizedEmail}`);
      return next(new AppError("Account not activated. Contact HR.", 403));
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    logSecurityEvent(SECURITY_EVENTS.AUTH_LOGIN_SUCCESS, { email: normalizedEmail, ip: req.ip });

    await AuditTrail.log({
      action: "User Login",
      category: "AUTH",
      performedBy: user._id,
      performedByName: user.name,
      performedByRole: user.role,
      target: user.email,
      metadata: { timestamp: new Date().toISOString() },
      severity: "LOW",
    });

    sendTokenResponse(user, 200, res);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.error("Login error:", err);
    next(err);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate("managerId", "name email");
    res.json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
};

exports.updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (await isPasswordCompromised(newPassword)) {
      return next(new AppError("Password has appeared in known breaches. Choose a different password.", 400));
    }
    const user = await User.findById(req.user._id).select("+password");
    if (!(await user.comparePassword(currentPassword))) return next(new AppError("Current password is incorrect.", 401));

    // Enforce basic length constraint
    if (newPassword.length < 6) {
      return next(new AppError("Password must be at least 6 characters.", 400));
    }

    user.password = newPassword;
    await user.save();
    await AuditTrail.log({ action: "Password Changed", category: "AUTH", performedBy: user._id, performedByName: user.name, performedByRole: user.role, target: user.email, severity: "MEDIUM" });
    logSecurityEvent(SECURITY_EVENTS.AUTH_PASSWORD_CHANGED, { userId: user._id.toString() });
    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email?.toLowerCase() });
    const genericMessage = "If this email is registered, a reset link has been sent.";
    if (!user) return res.json({ success: true, message: genericMessage });

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const resetURL = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password/${resetToken}`;
    await sendEmail({ to: user.email, subject: "Password Reset Request - LeaveMS", html: `<p>Hello ${user.name},</p><p>Reset your password <a href="${resetURL}">here</a>. This link expires in 1 hour.</p>` });
    logSecurityEvent(SECURITY_EVENTS.AUTH_PASSWORD_RESET_REQUESTED, { userId: user._id.toString() });

    res.json({ success: true, message: genericMessage });
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) return next(new AppError("Invalid or expired reset token.", 400));

    // Enforce basic length constraint
    if (password.length < 6) {
      return next(new AppError("Password must be at least 6 characters.", 400));
    }

    if (await isPasswordCompromised(password)) {
      return next(new AppError("Password has appeared in known breaches. Choose a different password.", 400));
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    await AuditTrail.log({ action: "Password Reset Success", category: "AUTH", performedBy: user._id, performedByName: user.name, performedByRole: user.role, target: user.email, severity: "MEDIUM" });
    logSecurityEvent(SECURITY_EVENTS.AUTH_PASSWORD_RESET_SUCCESS, { userId: user._id.toString() });

    res.json({ success: true, message: "Password reset successfully. You can now login." });
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res) => {
  await AuditTrail.log({ action: "User Logout", category: "AUTH", performedBy: req.user._id, performedByName: req.user.name, performedByRole: req.user.role, target: req.user.email, severity: "LOW" });
  res.clearCookie("jwt", cookieOptions());
  res.json({ success: true, message: "Logged out successfully." });
};
