const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB kết nối thành công: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Lỗi khi kết nối MongoDB: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
};

module.exports = connectDB;