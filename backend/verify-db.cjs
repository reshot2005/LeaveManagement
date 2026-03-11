require("dotenv").config({ path: "./.env" });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const verifyDbState = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    await mongoose.connect(uri);
    console.log("✅ MongoDB Connected");

    const email = "subramanya@aksharaenterprises.info";
    const user = await mongoose.connection.db.collection("users").findOne({ email: email.toLowerCase() });

    if (!user) {
      console.log("❌ User not found!");
      return;
    }

    console.log(`User ID: ${user._id}`);
    console.log(`Email: ${user.email}`);
    console.log(`Password Hash in DB: ${user.password}`);

    const testPassword = "password123";
    const isMatch = bcrypt.compareSync(testPassword, user.password);
    console.log(`Bcrypt Match for 'password123': ${isMatch}`);

    // Let's also try to find the user using Mongoose specifically
    const User = require("./models/User");
    const mUser = await User.findOne({ email: email.toLowerCase() }).select("+password");
    console.log(`Mongoose Email: ${mUser.email}`);
    console.log(`Mongoose Password Hash: ${mUser.password}`);
    const isMMatch = await mUser.comparePassword(testPassword);
    console.log(`Mongoose comparePassword Match: ${isMMatch}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
};

verifyDbState();
