const cron = require('node-cron');
const Hotel = require('../models/Hotel');
const Room = require('../models/Room');
const { updateHotelLowestPrice, clearExpiredRoomDiscounts } = require('../utils/hotelHelpers');

// Retry helper function
const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      if (attempt === maxRetries) {
        console.error('Max retries reached. Operation failed.');
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Cập nhật giá thấp nhất cho tất cả khách sạn mỗi ngày vào lúc 1 giờ sáng
exports.scheduleUpdateLowestPrices = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      console.log('Đang chạy job cập nhật giá thấp nhất cho tất cả khách sạn...');
      
      // Lấy tất cả khách sạn với trạng thái active
      const hotels = await Hotel.find({ status: 'active' });
      let failedHotels = [];
      
      // Cập nhật giá thấp nhất cho từng khách sạn
      for (const hotel of hotels) {
        try {
          await retryOperation(() => updateHotelLowestPrice(hotel._id));
          console.log(`Cập nhật giá thành công cho khách sạn ${hotel._id}`);
        } catch (error) {
          console.error(`Lỗi khi cập nhật khách sạn ${hotel._id}:`, error);
          failedHotels.push(hotel._id);
        }
      }
      
      if (failedHotels.length > 0) {
        console.warn(`Có ${failedHotels.length} khách sạn cập nhật thất bại:`, failedHotels);
      }
      console.log('Đã hoàn thành cập nhật giá thấp nhất cho tất cả khách sạn');
    } catch (error) {
      console.error('Lỗi tổng quát khi chạy job cập nhật giá:', error);
    }
  });
};

// Xóa giảm giá hết hạn cho tất cả khách sạn mỗi ngày vào lúc 2 giờ sáng
exports.scheduleClearExpiredDiscounts = () => {
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('Đang chạy job xóa giảm giá hết hạn...');
      
      // Lấy tất cả khách sạn với trạng thái active
      const hotels = await Hotel.find({ status: 'active' });
      let failedHotels = [];
      
      // Xóa giảm giá hết hạn cho từng khách sạn
      for (const hotel of hotels) {
        try {
          await retryOperation(() => clearExpiredRoomDiscounts(hotel._id));
          console.log(`Xóa giảm giá hết hạn thành công cho khách sạn ${hotel._id}`);
        } catch (error) {
          console.error(`Lỗi khi xóa giảm giá cho khách sạn ${hotel._id}:`, error);
          failedHotels.push(hotel._id);
        }
      }
      
      if (failedHotels.length > 0) {
        console.warn(`Có ${failedHotels.length} khách sạn xóa giảm giá thất bại:`, failedHotels);
      }
      console.log('Đã hoàn thành xóa giảm giá hết hạn');
    } catch (error) {
      console.error('Lỗi tổng quát khi chạy job xóa giảm giá:', error);
    }
  });
};