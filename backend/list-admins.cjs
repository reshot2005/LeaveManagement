require("dotenv").config({ path: "./.env" });
const mongoose = require("mongoose");
const User = require("./models/User");

const listAdmins = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    await mongoose.connect(uri);
    console.log("✅ MongoDB Connected");

    const admins = await User.find({ role: { $in: ["HR_ADMIN", "hr_admin", "ADMIN", "HR"] } });
    console.log(`Found ${admins.length} Admin/HR users:`);
    admins.forEach(a => {
      console.log(`- Email: ${a.email}, Role: ${a.role}, isActive: ${a.isActive}, ID: ${a._id}`);
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error listing admins:", error);
    process.exit(1);
  }
};

listAdmins();
