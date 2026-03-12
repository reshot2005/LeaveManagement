/**
 * One-time migration: Remove Saturday (6) from weekendDays in CalendarConfig.
 * After this script runs, only Sunday (0) will be a weekend day,
 * making Saturday a working day.
 */
require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("ERROR: No MONGODB_URI or MONGO_URI found in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB.");

  const result = await mongoose.connection.collection("calendarconfigs").updateMany(
    { weekendDays: 6 }, // find any doc that has Saturday (6) in weekendDays
    { $pull: { weekendDays: 6 } } // remove Saturday from the array
  );

  console.log(`Updated ${result.modifiedCount} CalendarConfig document(s).`);
  console.log("Saturday (6) removed from weekendDays. Only Sunday (0) remains as weekend.");

  const docs = await mongoose.connection.collection("calendarconfigs").find({}).toArray();
  docs.forEach((d) => {
    console.log(`  - Doc "${d.name}" weekendDays: [${d.weekendDays}]`);
  });

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
