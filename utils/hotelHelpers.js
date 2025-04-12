// utils/hotelHelpers.js
const Hotel = require('../models/Hotel');
const Room = require('../models/Room');

exports.updateHotelLowestPrice = async (hotelId) => {
  try {
    const currentDate = new Date();
    console.log(`👉 Bắt đầu cập nhật giá cho khách sạn: ${hotelId} tại thời điểm ${currentDate.toISOString()}`);

    // Lấy tất cả phòng của khách sạn có status = available
    const rooms = await Room.find({ 
      hotelId, 
      status: 'available' 
    });

    console.log(`🔍 Số lượng phòng có sẵn: ${rooms.length}`);

    if (rooms.length === 0) {
      console.log('⚠️ Không có phòng khả dụng, cập nhật giá về 0');
      await Hotel.findByIdAndUpdate(hotelId, { 
        lowestPrice: 0, 
        lowestDiscountedPrice: 0,
        highestDiscountPercent: 0
      });
      return;
    }

    // Xác định phòng có giá thấp nhất (trước khi giảm)
    let lowestPrice = Math.min(...rooms.map(room => room.price));
    console.log(`💰 Giá thấp nhất trước giảm: ${lowestPrice}`);

    // Tính toán giá sau giảm giá
    const roomsWithDiscount = rooms.map(room => {
      let discountedPrice = room.price;
      let discountActive = false;
      let discountPercent = 0;

      if (
        room.discountPercent > 0 &&
        room.discountStartDate && room.discountEndDate &&
        currentDate >= room.discountStartDate &&
        currentDate <= room.discountEndDate
      ) {
        discountedPrice = room.price * (1 - room.discountPercent / 100);
        discountActive = true;
        discountPercent = room.discountPercent;
        console.log(`🎯 Phòng ${room._id} có giảm giá ${discountPercent}% -> ${discountedPrice}`);
      } else {
        console.log(`ℹ️ Phòng ${room._id} không có giảm giá hoặc không nằm trong thời gian giảm.`);
      }

      return {
        price: room.price,
        discountedPrice,
        discountActive,
        discountPercent
      };
    });

    let lowestDiscountedPrice = Math.min(...roomsWithDiscount.map(room => room.discountedPrice));
    console.log(`💸 Giá thấp nhất sau giảm: ${lowestDiscountedPrice}`);

    const activeDiscounts = roomsWithDiscount.filter(room => room.discountActive);
    let highestDiscountPercent = 0;
    if (activeDiscounts.length > 0) {
      highestDiscountPercent = Math.max(...activeDiscounts.map(room => room.discountPercent));
    }
    console.log(`📉 Phần trăm giảm giá cao nhất: ${highestDiscountPercent}%`);

    await Hotel.findByIdAndUpdate(hotelId, {
      lowestPrice,
      lowestDiscountedPrice,
      highestDiscountPercent
    });

    console.log(`✅ Đã cập nhật giá cho khách sạn ${hotelId}`);

  } catch (error) {
    console.error('❌ Lỗi khi cập nhật giá thấp nhất cho khách sạn:', error);
    throw error;
  }
};
