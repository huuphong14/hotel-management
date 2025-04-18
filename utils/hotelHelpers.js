const Hotel = require('../models/Hotel');
const Room = require('../models/Room');

exports.updateHotelLowestPrice = async (hotelId) => {
  try {
    const currentDate = new Date();
    
    // Lấy tất cả phòng của khách sạn có status = available
    const rooms = await Room.find({ 
      hotelId, 
      status: 'available' 
    });

    if (rooms.length === 0) {
      await Hotel.findByIdAndUpdate(hotelId, { 
        lowestPrice: 0, 
        lowestDiscountedPrice: 0,
        highestDiscountPercent: 0
      });
      return;
    }

    // Xác định phòng có giá thấp nhất (trước khi giảm)
    let lowestPrice = Math.min(...rooms.map(room => room.price));

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
      } else {
        console.log(`Phòng ${room._id} không có giảm giá hoặc không nằm trong thời gian giảm.`);
      }

      return {
        price: room.price,
        discountedPrice,
        discountActive,
        discountPercent
      };
    });

    let lowestDiscountedPrice = Math.min(...roomsWithDiscount.map(room => room.discountedPrice));

    const activeDiscounts = roomsWithDiscount.filter(room => room.discountActive);
    let highestDiscountPercent = 0;
    if (activeDiscounts.length > 0) {
      highestDiscountPercent = Math.max(...activeDiscounts.map(room => room.discountPercent));
    }

    await Hotel.findByIdAndUpdate(hotelId, {
      lowestPrice,
      lowestDiscountedPrice,
      highestDiscountPercent
    });


  } catch (error) {
    console.error('Lỗi khi cập nhật giá thấp nhất cho khách sạn:', error);
    throw error;
  }
};
