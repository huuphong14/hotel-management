const cron = require('node-cron');
const Hotel = require('../models/Hotel');
const Room = require('../models/Room');
const { updateHotelLowestPrice } = require('./hotelHelpers');

// Cập nhật giá thấp nhất cho tất cả khách sạn mỗi ngày vào lúc 1 giờ sáng
exports.scheduleUpdateLowestPrices = () => {
  cron.schedule('0 1 * * *', async () => {
    try {
      console.log('Đang chạy job cập nhật giá thấp nhất cho tất cả khách sạn...');
      
      // Lấy tất cả khách sạn
      const hotels = await Hotel.find();
      
      // Cập nhật giá thấp nhất cho từng khách sạn
      for (const hotel of hotels) {
        await updateHotelLowestPrice(hotel._id);
      }
      
      console.log('Đã hoàn thành cập nhật giá thấp nhất cho tất cả khách sạn');
    } catch (error) {
      console.error('Lỗi khi cập nhật giá thấp nhất cho khách sạn:', error);
    }
  });
};