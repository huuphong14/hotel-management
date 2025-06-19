const mongoose = require('mongoose');
const Room = require('../models/Room');
const Hotel = require('../models/Hotel');
const { getBookedRoomIds } = require('../services/roomService');

exports.updateHotelLowestPrice = async (hotelId, checkIn, checkOut) => {
  try {
    const currentDate = new Date();
    // Sử dụng checkIn/checkOut từ tham số, hoặc mặc định 30 ngày
    const startDate = checkIn || currentDate;
    const endDate = checkOut || new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Lấy danh sách ID phòng đã được đặt
    const bookedRoomIds = await getBookedRoomIds(startDate, endDate);
    console.log(`Booked room IDs for hotel ${hotelId}:`, bookedRoomIds);

    // Aggregation pipeline
    const roomStats = await Room.aggregate([
      // Lọc các phòng khả dụng và không bị đặt
      {
        $match: {
          hotelId: new mongoose.Types.ObjectId(hotelId),
          status: 'available',
          _id: { $nin: bookedRoomIds.map(id => new mongoose.Types.ObjectId(id)) },
        },
      },
      // Tính toán giá sau giảm và phần trăm giảm giá
      {
        $project: {
          price: 1,
          discountedPrice: {
            $cond: {
              if: {
                $and: [
                  { $gt: ['$discountPercent', 0] },
                  { $ne: ['$discountStartDate', null] },
                  { $ne: ['$discountEndDate', null] },
                  { $gte: [currentDate, '$discountStartDate'] },
                  { $lte: [currentDate, '$discountEndDate'] },
                ],
              },
              then: {
                $multiply: ['$price', { $subtract: [1, { $divide: ['$discountPercent', 100] }] }],
              },
              else: '$price',
            },
          },
          discountPercent: {
            $cond: {
              if: {
                $and: [
                  { $gt: ['$discountPercent', 0] },
                  { $ne: ['$discountStartDate', null] },
                  { $ne: ['$discountEndDate', null] },
                  { $gte: [currentDate, '$discountStartDate'] },
                  { $lte: [currentDate, '$discountEndDate'] },
                ],
              },
              then: '$discountPercent',
              else: 0,
            },
          },
        },
      },
      // Sắp xếp theo discountPercent giảm dần để lấy phòng có giảm giá cao nhất
      {
        $sort: {
          discountPercent: -1,
        },
      },
      // Giới hạn chỉ lấy 1 phòng (phòng có discountPercent cao nhất)
      {
        $limit: 1,
      },
      // Nhóm để trả về các giá trị cần thiết
      {
        $group: {
          _id: null,
          lowestPrice: { $first: '$price' },
          lowestDiscountedPrice: { $first: '$discountedPrice' },
          highestDiscountPercent: { $first: '$discountPercent' },
        },
      },
    ]);

    // Xử lý kết quả
    const updateData = roomStats.length > 0
      ? {
          lowestPrice: roomStats[0].lowestPrice || 0,
          lowestDiscountedPrice: roomStats[0].lowestDiscountedPrice || 0,
          highestDiscountPercent: roomStats[0].highestDiscountPercent || 0,
        }
      : {
          lowestPrice: 0,
          lowestDiscountedPrice: 0,
          highestDiscountPercent: 0,
        };

    await Hotel.findByIdAndUpdate(hotelId, updateData);
    console.log(`Đã cập nhật giá cho khách sạn ${hotelId}:`, updateData);
  } catch (error) {
    console.error(`Lỗi khi cập nhật giá thấp nhất cho khách sạn ${hotelId}:`, error);
    throw error;
  }
};

exports.clearExpiredRoomDiscounts = async (hotelId) => {
  try {
    const currentDate = new Date();

    // Tìm các phòng có giảm giá hết hạn
    const expiredRooms = await Room.find({
      hotelId,
      discountPercent: { $gt: 0 },
      discountEndDate: { $lt: currentDate },
    });

    if (expiredRooms.length === 0) {
      console.log(`Không có phòng nào hết hạn giảm giá cho khách sạn ${hotelId}`);
      return;
    }

    // Cập nhật các phòng, xóa thông tin giảm giá
    const roomIds = expiredRooms.map(room => room._id);
    await Room.updateMany(
      { _id: { $in: roomIds } },
      {
        $set: {
          discountPercent: 0,
          discountStartDate: null,
          discountEndDate: null,
        },
      }
    );

    console.log(`Đã xóa giảm giá cho ${expiredRooms.length} phòng của khách sạn ${hotelId}`);

    // Cập nhật lại giá thấp nhất của khách sạn
    await exports.updateHotelLowestPrice(hotelId);
    console.log(`Đã cập nhật giá thấp nhất sau khi xóa giảm giá cho khách sạn ${hotelId}`);

  } catch (error) {
    console.error(`Lỗi khi xóa giảm giá hết hạn cho khách sạn ${hotelId}:`, error);
    throw error;
  }
};