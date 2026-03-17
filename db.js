const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Database DevCORE Terhubung 🛡️");
    } catch (err) {
        console.error("Gagal koneksi DB:", err);
        process.exit(1);
    }
};

module.exports = connectDB;
