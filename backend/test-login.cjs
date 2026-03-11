const axios = require("axios");

const testLogin = async () => {
  try {
    console.log("Testing login to http://localhost:5000/api/auth/login...");
    const response = await axios.post("http://localhost:5000/api/auth/login", {
      email: "subramanya@aksharaenterprises.info",
      password: "password123"
    });

    console.log("✅ Login Success!");
    console.log("Status:", response.status);
    console.log("Data:", JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log("❌ Login Failed!");
    if (error.response) {
      console.log("Status:", error.response.status);
      console.log("Message:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.log("Error:", error.message);
    }
  }
};

testLogin();
