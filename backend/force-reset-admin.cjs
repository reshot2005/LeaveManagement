require("dotenv").config({ path: "./.env" });
const mongoose = require("mongoose");
const User = require("./models/User");

const forceResetAdmin = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    await mongoose.connect(uri);
    console.log("✅ MongoDB Connected");

    const email = "subramanya@aksharaenterprises.info";
    const password = "password123";

    // Find if user exists with this email or role HR_ADMIN
    let user = await User.findOne({ $or: [{ email: email.toLowerCase() }, { role: "HR_ADMIN" }] });

    if (user) {
      console.log(`Found existing user: ${user.email} (Role: ${user.role})`);
      user.email = email.toLowerCase();
      user.password = password; // Pre-save hook will hash this
      user.isActive = true;
      user.role = "HR_ADMIN";
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();
      console.log(`✅ Admin user updated successfully via Mongoose model.`);
    } else {
      console.log("Creating new HR_ADMIN user...");
      user = await User.create({
        name: "HR Administrator",
        email: email.toLowerCase(),
        password: password,
        role: "HR_ADMIN",
        department: "Human Resources",
        designation: "HR Manager",
        isActive: true,
        probationStatus: false
      });
      console.log(`✅ Admin user created successfully via Mongoose model.`);
    }

    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Password: ${password}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error force resetting admin:", error);
    process.exit(1);
  }
};

forceResetAdmin();
