require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cron = require("node-cron");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const path = require("path");
const connectDB = require("./config/db");
const { globalErrorHandler } = require("./middleware/errorHandler");
const { apiLimiter } = require("./middleware/rateLimiter");
const { slowRequestLogger } = require("./utils/performance");
const { getRequiredJwtSecret, getAllowedOrigins } = require("./config/security");
const { mongoSanitize, enforceJsonBodySize } = require("./middleware/requestSecurity");
const { logSecurityEvent, SECURITY_EVENTS } = require("./services/securityEventService");

const authRoutes = require("./routes/authRoutes");
const leaveRoutes = require("./routes/leaveRoutes");
const userRoutes = require("./routes/userRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const leaveTypeRoutes = require("./routes/leaveTypeRoutes");
const reportRoutes = require("./routes/reportRoutes");
const managerRoutes = require("./routes/managerRoutes");
const adminRoutes = require("./routes/adminRoutes");
const calendarRoutes = require("./routes/calendarRoutes");
const holidayRoutes = require("./routes/holiday.routes");
const flexiHolidayRoutes = require("./routes/flexiHolidayRoutes");
const { ensureFlexiHolidaysSeeded } = require("./services/flexiHolidayService");
const { getDiagnostics: getEmailDiagnostics, verifyTransporter } = require("./services/notificationMailer");

const { creditMonthlyLeaves } = require("./services/monthlyCredit");

const app = express();
const PORT = process.env.PORT || 5000;

// Fail fast on weak crypto config.
getRequiredJwtSecret();

connectDB();
ensureFlexiHolidaysSeeded().catch((error) => {
  console.error("Failed to seed flexi holidays:", error.message);
});

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: true,
    referrerPolicy: { policy: "no-referrer" },
  })
);

const allowedOrigins = getAllowedOrigins();
const effectiveAllowedOrigins =
  allowedOrigins.length > 0
    ? allowedOrigins
    : ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser clients may have no origin. Keep that path open.
      if (!origin) return callback(null, true);
      if (effectiveAllowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      logSecurityEvent("CORS_BLOCKED", { origin });
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(enforceJsonBodySize(1024 * 1024));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(mongoSanitize);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.use("/api/", apiLimiter);
app.use(slowRequestLogger(2000));

app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString(), version: "1.0.0" });
});

app.use("/api/auth", authRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/leave", leaveRoutes);
app.use("/api/users", userRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/leave-types", leaveTypeRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/managers", managerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/flexi-holidays", flexiHolidayRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

app.use(globalErrorHandler);

function registerCronJobs() {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_CRON === "true") {
    cron.schedule(
      "0 0 1 * *",
      async () => {
        if (process.env.NODE_ENV !== "production") {
          console.log("Running monthly leave credit...");
        }
        try {
          await creditMonthlyLeaves({ source: "MONTHLY_JOB" });
          if (process.env.NODE_ENV !== "production") {
            console.log("Monthly credit completed");
          }
        } catch (err) {
          console.error("Monthly credit failed:", err.message);
        }
      },
      { timezone: process.env.ORG_TIMEZONE || "Asia/Kolkata" }
    );

    if (process.env.NODE_ENV !== "production") {
      console.log("Cron jobs enabled");
    }
  }
}

function startServer(port = PORT) {
  registerCronJobs();

  const emailDiag = getEmailDiagnostics();
  console.log("[email] notificationsEnabled:", emailDiag.enabled);
  console.log("[email] smtp:", `${emailDiag.smtpHost}:${emailDiag.smtpPort}`);
  console.log("[email] smtpUser:", emailDiag.smtpUser || "(empty)");
  console.log("[email] smtpPass:", emailDiag.smtpPassMasked);
  console.log("[email] smtpFrom:", emailDiag.smtpFrom || "(empty)");
  console.log("[email] adminRecipients:", emailDiag.adminRecipients.length ? emailDiag.adminRecipients.join(", ") : "(none)");

  verifyTransporter().then((result) => {
    if (result?.success) {
      console.log("SMTP ready for sending emails");
    } else if (result?.skipped) {
      console.log(`[email] transporter verification skipped: ${result.reason || "test mode"}`);
    } else {
      console.log(`[email] transporter verification failed: ${result?.error || "unknown error"}`);
    }
  });

  const server = app.listen(port, () => {
    if (process.env.NODE_ENV !== "production") {
      console.log(`Server running on http://localhost:${port}`);
      console.log(`API endpoint: http://localhost:${port}/api`);
      console.log(`Health check: http://localhost:${port}/health`);
    }
  });

  let isShuttingDown = false;
  const gracefulShutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    if (process.env.NODE_ENV !== "production") {
      console.log(`\n${signal} received. Shutting down gracefully...`);
    }

    const forceExit = setTimeout(() => {
      process.exit(1);
    }, 10000);

    try {
      await new Promise((resolve) => server.close(resolve));
      await mongoose.connection.close();
      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Shutdown error:", err.message);
      }
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("uncaughtException", (err) => {
    if (process.env.NODE_ENV !== "production") {
      console.error("Uncaught Exception:", err);
    }
    logSecurityEvent(SECURITY_EVENTS.SECURITY_HEADER_VIOLATION, { source: "uncaughtException" });
    gracefulShutdown("UNCAUGHT_EXCEPTION");
  });
  process.on("unhandledRejection", (err) => {
    if (process.env.NODE_ENV !== "production") {
      console.error("Unhandled Rejection:", err);
    }
    gracefulShutdown("UNHANDLED_REJECTION");
  });

  return server;
}

if (require.main === module) {
  startServer(PORT);
}

module.exports = app;
module.exports.startServer = startServer;
