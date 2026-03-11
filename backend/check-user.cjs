require("dotenv").config({ path: "./.env" });
const mongoose = require("mongoose");

const checkUser = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    await mongoose.connect(uri);
    console.log("✅ MongoDB Connected");

    const emailSearch = "subramanya@aksharaenterprises.info";
    const users = await mongoose.connection.db.collection("users").find({ email: emailSearch }).toArray();

    console.log(`Found ${users.length} user(s) with email: ${emailSearch}`);
    users.forEach(u => {
      console.log(`ID: ${u._id}`);
      console.log(`Name: ${u.name}`);
      console.log(`Role: ${u.role}`);
      console.log(`isActive: ${u.isActive}`);
      // Don't log full password hash for security, just check if it looks like a bcrypt hash $2a$ or $2b$
      console.log(`Password starts with: ${u.password ? u.password.substring(0, 7) : 'NONE'}`);
    });

    const allAdmins = await mongoose.connection.db.collection("users").find({ role: { $in: ["HR_ADMIN", "hr_admin", "ADMIN", "HR"] } }).toArray();
    console.log(`Total Admin/HR users found: ${allAdmins.length}`);
    allAdmins.forEach(a => {
        console.log(`Admin - Email: ${a.email}, Role: ${a.role}, isActive: ${a.isActive}`);
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error checking user:", error.message);
    process.exit(1);
  }
};

checkUser();
