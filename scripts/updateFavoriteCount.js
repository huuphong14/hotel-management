// scripts/updateFavoriteCount.js
const mongoose = require('mongoose');
const User = require('../models/User');
const Hotel = require('../models/Hotel');
require('dotenv').config();

// Kết nối database
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Hàm cập nhật số lượt yêu thích cho tất cả khách sạn
const updateFavoriteCount = async () => {
  try {
    console.log('Bắt đầu cập nhật số lượt yêu thích...');
    
    // Lấy tất cả khách sạn
    const hotels = await Hotel.find();
    
    // Lấy tất cả người dùng
    const users = await User.find();
    
    // Tạo map đếm số lượt yêu thích cho mỗi khách sạn
    const favoriteCountMap = {};
    
    // Đếm số lượt yêu thích từ danh sách yêu thích của người dùng
    for (const user of users) {
      for (const hotelId of user.favoriteHotels) {
        const hotelIdStr = hotelId.toString();
        favoriteCountMap[hotelIdStr] = (favoriteCountMap[hotelIdStr] || 0) + 1;
      }
    }
    
    // Cập nhật favoriteCount cho từng khách sạn
    for (const hotel of hotels) {
      const hotelId = hotel._id.toString();
      hotel.favoriteCount = favoriteCountMap[hotelId] || 0;
      await hotel.save();
      console.log(`Đã cập nhật khách sạn ${hotel.name}: ${hotel.favoriteCount} lượt yêu thích`);
    }
    
    console.log('Cập nhật hoàn tất!');
    process.exit(0);
  } catch (error) {
    console.error('Lỗi khi cập nhật:', error);
    process.exit(1);
  }
};

// Chạy hàm cập nhật
updateFavoriteCount();