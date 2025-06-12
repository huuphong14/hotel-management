const mongoose = require('mongoose');
const Hotel = require('./models/Hotel');
const { updateHotelLowestPrice, clearExpiredRoomDiscounts } = require('./utils/hotelHelpers');

async function updateAllHotelPrices() {
  try {
    await mongoose.connect('mongodb+srv://phong:12345Phong@hotelmanagementbooking.feub6.mongodb.net/hotelmanagementbooking', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Đã kết nối đến MongoDB');

    console.log('Đang chạy cập nhật giá thấp nhất và xóa khuyến mãi hết hạn...');
    const hotels = await Hotel.find();
    const BATCH_SIZE = 100;

    for (let i = 0; i < hotels.length; i += BATCH_SIZE) {
      const batch = hotels.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(hotel =>
          (async () => {
            try {
              // Xóa khuyến mãi hết hạn trước
              await clearExpiredRoomDiscounts(hotel._id);
              // Cập nhật giá khách sạn sau
              await updateHotelLowestPrice(hotel._id);
            } catch (error) {
              console.error(`Lỗi khi xử lý khách sạn ${hotel._id}:`, error);
            }
          })()
        )
      );
    }

    console.log('Đã hoàn thành cập nhật giá và xóa khuyến mãi hết hạn');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Lỗi khi chạy cập nhật giá:', error);
  }
}

updateAllHotelPrices();